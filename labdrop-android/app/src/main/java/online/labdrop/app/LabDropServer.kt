package online.labdrop.app

import android.content.Context
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.net.URLEncoder
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

data class TransferFileRecord(
    val id: String,
    val originalName: String,
    val storageName: String,
    var size: Long,
    val mimetype: String,
    val category: String = "general"
)

data class TransferRecord(
    val id: String,
    val shortCode: String,
    val transferName: String,
    val createdAt: Long,
    val expiresAt: Long,
    val files: MutableList<TransferFileRecord>,
    var totalSize: Long = 0,
    val isOffline: Boolean = true,
    var qrCode: String = "",
    var directUrl: String = ""
)

class LabDropServer(
    private val context: Context,
    port: Int = 8080,
    private val onDownloadCompleted: ((String) -> Unit)? = null
) : NanoHTTPD("0.0.0.0", port) {

    private val transfers = ConcurrentHashMap<String, TransferRecord>()
    private val uploadsDir = File(context.filesDir, "uploads").apply { mkdirs() }

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method

        // 1. Static Configuration for Frontend
        if (uri == "/js/site-config.js") {
            val script = "window.LABDROP_CONFIG = { contactEmail: 'yuvaankaarthikeyaa.1206@gmail.com', portfolioUrl: '' };"
            return newFixedLengthResponse(Response.Status.OK, "application/javascript; charset=UTF-8", script)
        }

        // 2. API: Config
        if (uri == "/api/config") {
            val config = JSONObject().apply {
                put("contactEmail", "yuvaankaarthikeyaa.1206@gmail.com")
                put("portfolioUrl", "")
            }
            return newJsonResponse(config.toString())
        }

        // 3. API: Analytics visit ping
        if (uri == "/api/analytics/visit") {
            return newJsonResponse("{\"success\":true}")
        }

        // 4. API: Upload Initiate (POST)
        if (uri == "/api/upload/initiate" && method == Method.POST) {
            return handleUploadInitiate(session)
        }

        // 4b. API: Fallback Form-Relayed Upload (POST /api/upload)
        if (uri == "/api/upload" && method == Method.POST) {
            return handleMultipartUpload(session)
        }

        // 5. Local File Upload Stream (PUT /api/upload/local/:transferId/:storageName)
        if (uri.startsWith("/api/upload/local/") && method == Method.PUT) {
            return handleLocalUploadPut(session, uri)
        }

        // 6. API: Upload Complete (POST)
        if (uri == "/api/upload/complete" && method == Method.POST) {
            return handleUploadComplete(session)
        }

        // 7. API: Code Lookup (GET /api/transfer/code/:code)
        if (uri.startsWith("/api/transfer/code/") && method == Method.GET) {
            val code = uri.removePrefix("/api/transfer/code/").trim().uppercase()
            val transfer = transfers.values.find { it.shortCode.equals(code, ignoreCase = true) }
            return if (transfer != null) {
                newJsonResponse(JSONObject().put("id", transfer.id).put("shortCode", transfer.shortCode).toString())
            } else {
                newFixedLengthResponse(Response.Status.NOT_FOUND, "application/json", "{\"error\":\"Transfer code not found\"}")
            }
        }

        // 8. API: Get Transfer Metadata (GET /api/transfer/:id)
        if (uri.startsWith("/api/transfer/") && !uri.contains("/verify-") && method == Method.GET) {
            val id = uri.removePrefix("/api/transfer/").trim()
            val transfer = transfers[id] ?: transfers.values.find { it.shortCode.equals(id, ignoreCase = true) }
            return if (transfer != null) {
                handleGetTransfer(transfer)
            } else {
                newFixedLengthResponse(Response.Status.NOT_FOUND, "application/json", "{\"error\":\"Transfer not found\"}")
            }
        }

        // 9. API: Proximity & PIN Verification endpoints
        if (uri.contains("/verify-proximity") || uri.contains("/verify-pin")) {
            return newJsonResponse("{\"success\":true,\"verified\":true}")
        }

        // 10. File Download (GET /download/:transferId/:fileId)
        if (uri.startsWith("/download/") && !uri.endsWith("/zip") && method == Method.GET) {
            val parts = uri.removePrefix("/download/").split("/")
            if (parts.size >= 2) {
                return handleFileDownload(parts[0], parts[1])
            }
        }

        // 11. Download All as ZIP (GET /download/:transferId/zip)
        if (uri.startsWith("/download/") && uri.endsWith("/zip") && method == Method.GET) {
            val transferId = uri.removePrefix("/download/").removeSuffix("/zip").trim()
            return handleZipDownload(transferId)
        }

        // 12. Frontend Pages: /t/:id -> transfer.html
        if (uri.startsWith("/t/")) {
            return serveAssetFile("transfer.html", "text/html; charset=UTF-8")
                ?: newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "404 Not Found")
        }

        // 13. Root or index: / or /index.html
        if (uri == "/" || uri == "/index.html") {
            return serveAssetFile("index.html", "text/html; charset=UTF-8")
                ?: newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "404 Not Found")
        }

        // 14. Static Assets: /css/*, /js/*, *.png, etc.
        val assetPath = uri.removePrefix("/")
        val mime = getMimeTypeForAsset(assetPath)
        val assetResponse = serveAssetFile(assetPath, mime)
        if (assetResponse != null) return assetResponse

        return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "404 Not Found")
    }

    private fun handleUploadInitiate(session: IHTTPSession): Response {
        return try {
            val map = HashMap<String, String>()
            session.parseBody(map)
            val postData = map["postData"] ?: ""
            val json = JSONObject(postData)

            val transferId = UUID.randomUUID().toString()
            val customCode = json.optString("customCode", "").trim().uppercase()
            val shortCode = if (customCode.isNotEmpty()) customCode else UUID.randomUUID().toString().substring(0, 6).uppercase()
            val transferName = json.optString("transferName", "Offline Lab Transfer")

            val filesArray = json.optJSONArray("files") ?: JSONArray()
            val fileRecords = mutableListOf<TransferFileRecord>()
            val uploadUrlsArray = JSONArray()

            for (i in 0 until filesArray.length()) {
                val fileObj = filesArray.getJSONObject(i)
                val originalName = fileObj.optString("name", "file_$i")
                val size = fileObj.optLong("size", 0L)
                val type = fileObj.optString("type", "application/octet-stream")
                val fileId = UUID.randomUUID().toString()
                val storageName = "${fileId}__${originalName}"

                val record = TransferFileRecord(
                    id = fileId,
                    originalName = originalName,
                    storageName = storageName,
                    size = size,
                    mimetype = type
                )
                fileRecords.add(record)

                val uploadUrlObj = JSONObject().apply {
                    put("fileId", fileId)
                    put("name", originalName)
                    put("originalName", originalName)
                    put("storageName", storageName)
                    put("uploadUrl", "/api/upload/local/$transferId/$storageName")
                }
                uploadUrlsArray.put(uploadUrlObj)
            }

            val now = System.currentTimeMillis()
            val expiresAt = now + 30 * 60 * 1000L // 30 minutes
            val transfer = TransferRecord(
                id = transferId,
                shortCode = shortCode,
                transferName = transferName,
                createdAt = now,
                expiresAt = expiresAt,
                files = fileRecords
            )
            transfers[transferId] = transfer

            val res = JSONObject().apply {
                put("success", true)
                put("transferId", transferId)
                put("shortCode", shortCode)
                put("files", uploadUrlsArray)
                put("uploadUrls", uploadUrlsArray)
                put("proximity", JSONObject().put("enabled", false))
            }
            newJsonResponse(res.toString())
        } catch (e: Exception) {
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json", "{\"error\":\"${e.message}\"}")
        }
    }

    private fun handleMultipartUpload(session: IHTTPSession): Response {
        return try {
            val filesMap = HashMap<String, String>()
            session.parseBody(filesMap)

            val params = session.parameters
            val customCode = params["customCode"]?.firstOrNull()?.trim()?.uppercase() ?: ""
            val transferName = params["transferName"]?.firstOrNull() ?: "Offline Transfer"
            val transferId = UUID.randomUUID().toString()
            val shortCode = if (customCode.isNotEmpty()) customCode else UUID.randomUUID().toString().substring(0, 6).uppercase()

            val transferDir = File(uploadsDir, transferId).apply { mkdirs() }
            val fileRecords = mutableListOf<TransferFileRecord>()
            var totalBytes = 0L

            for ((key, tempFilePath) in filesMap) {
                if (key.startsWith("files") || key == "files") {
                    val tempFile = File(tempFilePath)
                    if (tempFile.exists()) {
                        val originalName = params[key]?.firstOrNull() ?: tempFile.name
                        val fileId = UUID.randomUUID().toString()
                        val storageName = "${fileId}__$originalName"
                        val destFile = File(transferDir, storageName)
                        tempFile.copyTo(destFile, overwrite = true)
                        val fileSize = destFile.length()
                        totalBytes += fileSize
                        fileRecords.add(
                            TransferFileRecord(
                                id = fileId,
                                originalName = originalName,
                                storageName = storageName,
                                size = fileSize,
                                mimetype = "application/octet-stream"
                            )
                        )
                    }
                }
            }

            val now = System.currentTimeMillis()
            val expiresAt = now + 30 * 60 * 1000L
            val localIp = NetworkUtils.getLocalIpAddress()
            val directUrl = "http://$localIp:8080/?CODE=$shortCode"
            val qrCodeDataUrl = NetworkUtils.generateQrBase64(directUrl, 400)

            val transfer = TransferRecord(
                id = transferId,
                shortCode = shortCode,
                transferName = transferName,
                createdAt = now,
                expiresAt = expiresAt,
                totalSize = totalBytes,
                files = fileRecords,
                directUrl = directUrl,
                qrCode = qrCodeDataUrl
            )
            transfers[transferId] = transfer

            val transferJson = buildTransferJsonObject(transfer)
            val res = JSONObject().apply {
                put("success", true)
                put("transferId", transferId)
                put("shortCode", shortCode)
                put("code", shortCode)
                put("url", directUrl)
                put("directUrl", directUrl)
                put("qrCode", qrCodeDataUrl)
                put("expiresAt", expiresAt)
                put("fileCount", fileRecords.size)
                put("totalSize", totalBytes)
                put("files", transferJson.optJSONArray("files"))
                put("transfer", transferJson)
            }
            newJsonResponse(res.toString())
        } catch (e: Exception) {
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json", "{\"error\":\"${e.message}\"}")
        }
    }

    private fun handleLocalUploadPut(session: IHTTPSession, uri: String): Response {
        return try {
            val parts = uri.removePrefix("/api/upload/local/").split("/")
            if (parts.size < 2) {
                return newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", "{\"error\":\"Invalid upload URL\"}")
            }
            val transferId = parts[0]
            val storageName = parts[1]

            val destDir = File(uploadsDir, transferId).apply { mkdirs() }
            val destFile = File(destDir, storageName)

            val contentLength = session.headers["content-length"]?.toLongOrNull() ?: -1L
            FileOutputStream(destFile).use { fos ->
                val buf = ByteArray(64 * 1024)
                var remaining = contentLength
                while (remaining > 0 || contentLength == -1L) {
                    val toRead = if (contentLength == -1L) buf.size else Math.min(buf.size.toLong(), remaining).toInt()
                    val read = session.inputStream.read(buf, 0, toRead)
                    if (read <= 0) break
                    fos.write(buf, 0, read)
                    if (contentLength != -1L) remaining -= read
                }
            }

            // Update file record size
            val transfer = transfers[transferId]
            transfer?.files?.find { it.storageName == storageName }?.let {
                it.size = destFile.length()
            }

            newJsonResponse("{\"success\":true}")
        } catch (e: Exception) {
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json", "{\"error\":\"${e.message}\"}")
        }
    }

    private fun handleUploadComplete(session: IHTTPSession): Response {
        return try {
            val map = HashMap<String, String>()
            session.parseBody(map)
            val postData = map["postData"] ?: ""
            val json = JSONObject(postData)
            val transferId = json.optString("transferId", "")

            val transfer = transfers[transferId]
                ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, "application/json", "{\"error\":\"Transfer not found\"}")

            val transferDir = File(uploadsDir, transferId)
            var totalBytes = 0L
            for (f in transfer.files) {
                val fileOnDisk = File(transferDir, f.storageName)
                if (fileOnDisk.exists()) {
                    f.size = fileOnDisk.length()
                    totalBytes += f.size
                }
            }
            transfer.totalSize = totalBytes

            val localIp = NetworkUtils.getLocalIpAddress()
            val directUrl = "http://$localIp:8080/?CODE=${transfer.shortCode}"
            val qrCodeDataUrl = NetworkUtils.generateQrBase64(directUrl, 400)
            transfer.directUrl = directUrl
            transfer.qrCode = qrCodeDataUrl

            val transferJson = buildTransferJsonObject(transfer)
            val res = JSONObject().apply {
                put("success", true)
                put("transferId", transfer.id)
                put("shortCode", transfer.shortCode)
                put("code", transfer.shortCode)
                put("url", directUrl)
                put("directUrl", directUrl)
                put("qrCode", qrCodeDataUrl)
                put("expiresAt", transfer.expiresAt)
                put("fileCount", transfer.files.size)
                put("linkCount", 0)
                put("totalSize", transfer.totalSize)
                put("files", transferJson.optJSONArray("files"))
                put("folderStructure", JSONObject())
                put("transfer", transferJson)
            }
            newJsonResponse(res.toString())
        } catch (e: Exception) {
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json", "{\"error\":\"${e.message}\"}")
        }
    }

    private fun handleGetTransfer(transfer: TransferRecord): Response {
        val transferJson = buildTransferJsonObject(transfer)
        val res = JSONObject().apply {
            put("transfer", transferJson)
        }
        return newJsonResponse(res.toString())
    }

    private fun buildTransferJsonObject(transfer: TransferRecord): JSONObject {
        val filesArray = JSONArray()
        for (f in transfer.files) {
            val fObj = JSONObject().apply {
                put("id", f.id)
                put("originalName", f.originalName)
                put("storageName", f.storageName)
                put("size", f.size)
                put("mimetype", f.mimetype)
            }
            filesArray.put(fObj)
        }
        return JSONObject().apply {
            put("id", transfer.id)
            put("shortCode", transfer.shortCode)
            put("code", transfer.shortCode)
            put("transferName", transfer.transferName)
            put("totalSize", transfer.totalSize)
            put("fileCount", transfer.files.size)
            put("createdAt", transfer.createdAt)
            put("expiresAt", transfer.expiresAt)
            put("isOffline", true)
            put("hasPin", false)
            put("qrCode", transfer.qrCode)
            put("directUrl", transfer.directUrl)
            put("url", transfer.directUrl)
            put("files", filesArray)
            put("links", JSONArray())
        }
    }

    private fun handleFileDownload(transferId: String, fileId: String): Response {
        val transfer = transfers[transferId]
            ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Transfer not found")

        val fileRecord = transfer.files.find { it.id == fileId || it.storageName == fileId }
            ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "File not found")

        val fileOnDisk = File(uploadsDir, "$transferId/${fileRecord.storageName}")
        if (!fileOnDisk.exists()) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "File missing on disk")
        }

        return try {
            val fis = FileInputStream(fileOnDisk)
            val safeName = URLEncoder.encode(fileRecord.originalName, "UTF-8").replace("+", "%20")
            val res = newFixedLengthResponse(
                Response.Status.OK,
                fileRecord.mimetype.ifEmpty { "application/octet-stream" },
                fis,
                fileOnDisk.length()
            )
            res.addHeader("Content-Disposition", "attachment; filename=\"${fileRecord.originalName}\"; filename*=UTF-8''$safeName")
            res.addHeader("Accept-Ranges", "bytes")

            onDownloadCompleted?.invoke(fileRecord.originalName)
            res
        } catch (e: Exception) {
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, MIME_PLAINTEXT, "Download error: ${e.message}")
        }
    }

    private fun handleZipDownload(transferId: String): Response {
        val transfer = transfers[transferId]
            ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Transfer not found")

        val transferDir = File(uploadsDir, transferId)
        val filesToZip = transfer.files.mapNotNull { f ->
            val diskFile = File(transferDir, f.storageName)
            if (diskFile.exists()) Pair(f.originalName, diskFile) else null
        }

        if (filesToZip.isEmpty()) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "No files found to zip")
        }

        val pipedOut = PipedOutputStream()
        val pipedIn = PipedInputStream(pipedOut, 64 * 1024)

        Thread {
            try {
                ZipOutputStream(pipedOut).use { zos ->
                    val buffer = ByteArray(32 * 1024)
                    for ((name, diskFile) in filesToZip) {
                        try {
                            FileInputStream(diskFile).use { fis ->
                                zos.putNextEntry(ZipEntry(name))
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
        response.addHeader("Content-Disposition", "attachment; filename=\"${transfer.transferName}.zip\"")
        onDownloadCompleted?.invoke("All Files (ZIP)")
        return response
    }

    private fun serveAssetFile(path: String, mimeType: String): Response? {
        return try {
            val fullPath = "web/$path"
            val stream: InputStream = context.assets.open(fullPath)
            newChunkedResponse(Response.Status.OK, mimeType, stream)
        } catch (_: Exception) {
            null
        }
    }

    private fun getMimeTypeForAsset(path: String): String {
        val lower = path.lowercase()
        return when {
            lower.endsWith(".html") -> "text/html; charset=UTF-8"
            lower.endsWith(".css") -> "text/css; charset=UTF-8"
            lower.endsWith(".js") -> "application/javascript; charset=UTF-8"
            lower.endsWith(".png") -> "image/png"
            lower.endsWith(".webp") -> "image/webp"
            lower.endsWith(".svg") -> "image/svg+xml"
            lower.endsWith(".ico") -> "image/x-icon"
            lower.endsWith(".json") -> "application/json; charset=UTF-8"
            else -> "application/octet-stream"
        }
    }

    private fun newJsonResponse(json: String): Response {
        return newFixedLengthResponse(Response.Status.OK, "application/json; charset=UTF-8", json)
    }
}
