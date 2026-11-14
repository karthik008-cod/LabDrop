package online.labdrop.app

import android.content.Context
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.net.URLEncoder
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class LabDropServer(
    private val context: Context,
    port: Int = 8080,
    private val onDownload: (String) -> Unit
) : NanoHTTPD(port) {

    private val sharedFiles = mutableListOf<SharedFile>()

    fun setFiles(files: List<SharedFile>) {
        synchronized(sharedFiles) {
            sharedFiles.clear()
            sharedFiles.addAll(files)
        }
    }

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method

        if (method != Method.GET) {
            return newFixedLengthResponse(Response.Status.METHOD_NOT_ALLOWED, MIME_PLAINTEXT, "Method Not Allowed")
        }

        return when {
            uri == "/" || uri == "/index.html" -> servePortalHtml()
            uri == "/api/info" -> serveApiInfo()
            uri == "/download/all" -> serveZipAll()
            uri.startsWith("/download/") -> serveSingleFile(uri.removePrefix("/download/"))
            else -> newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "404 Not Found")
        }
    }

    private fun servePortalHtml(): Response {
        return try {
            val html = context.assets.open("web/portal.html").bufferedReader().use { it.readText() }
            newFixedLengthResponse(Response.Status.OK, "text/html; charset=UTF-8", html)
        } catch (_: Exception) {
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, MIME_PLAINTEXT, "Failed to load portal")
        }
    }

    private fun serveApiInfo(): Response {
        val root = JSONObject()
        val filesArray = JSONArray()
        var totalBytes = 0L

        synchronized(sharedFiles) {
            for (f in sharedFiles) {
                totalBytes += f.size
                val fileObj = JSONObject().apply {
                    put("id", f.id)
                    put("name", f.name)
                    put("size", f.size)
                    put("formattedSize", f.getFormattedSize())
                    put("mimeType", f.mimeType)
                }
                filesArray.put(fileObj)
            }
        }

        root.put("files", filesArray)
        root.put("totalSize", totalBytes)
        root.put("totalSizeFormatted", formatBytes(totalBytes))

        return newFixedLengthResponse(Response.Status.OK, "application/json; charset=UTF-8", root.toString())
    }

    private fun serveSingleFile(fileId: String): Response {
        val file = synchronized(sharedFiles) { sharedFiles.find { it.id == fileId } }
            ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "File Not Found")

        return try {
            val inputStream = context.contentResolver.openInputStream(file.uri)
                ?: return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, MIME_PLAINTEXT, "Cannot read file")

            val safeFilename = URLEncoder.encode(file.name, "UTF-8").replace("+", "%20")
            val response = newFixedLengthResponse(
                Response.Status.OK,
                file.mimeType.ifEmpty { "application/octet-stream" },
                inputStream,
                file.size
            )
            response.addHeader("Content-Disposition", "attachment; filename=\"${file.name}\"; filename*=UTF-8''$safeFilename")
            response.addHeader("Accept-Ranges", "bytes")

            onDownload(file.name)
            response
        } catch (e: Exception) {
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, MIME_PLAINTEXT, "Error: ${e.message}")
        }
    }

    private fun serveZipAll(): Response {
        val filesCopy = synchronized(sharedFiles) { sharedFiles.toList() }
        if (filesCopy.isEmpty()) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "No files available")
        }

        val pipedOut = PipedOutputStream()
        val pipedIn = PipedInputStream(pipedOut, 64 * 1024)

        Thread {
            try {
                ZipOutputStream(pipedOut).use { zos ->
                    val buffer = ByteArray(32 * 1024)
                    for (file in filesCopy) {
                        try {
                            context.contentResolver.openInputStream(file.uri)?.use { fis ->
                                zos.putNextEntry(ZipEntry(file.name))
                                var len: Int
                                while (fis.read(buffer).also { len = it } > 0) {
                                    zos.write(buffer, 0, len)
                                }
                                zos.closeEntry()
                            }
                        } catch (_: Exception) {}
                    }
                    zos.finish()
                }
            } catch (_: Exception) {}
        }.start()

        val response = newChunkedResponse(Response.Status.OK, "application/zip", pipedIn)
        response.addHeader("Content-Disposition", "attachment; filename=\"LabDrop_Files.zip\"")
        onDownload("All Files (ZIP)")
        return response
    }

    private fun formatBytes(bytes: Long): String {
        if (bytes <= 0) return "0 B"
        val units = arrayOf("B", "KB", "MB", "GB")
        val digitGroups = (Math.log10(bytes.toDouble()) / Math.log10(1024.0)).toInt()
        val num = bytes / Math.pow(1024.0, digitGroups.toDouble())
        return String.format(java.util.Locale.US, "%.1f %s", num, units[digitGroups.coerceIn(0, units.size - 1)])
    }
}
