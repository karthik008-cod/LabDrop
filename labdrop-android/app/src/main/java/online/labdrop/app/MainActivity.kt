package online.labdrop.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.cardview.widget.CardView
import java.util.UUID

class MainActivity : AppCompatActivity() {

    private val selectedFiles = mutableListOf<SharedFile>()
    private var server: LabDropServer? = null
    private var totalDownloads = 0

    private lateinit var tvStatusTitle: TextView
    private lateinit var tvStatusSub: TextView
    private lateinit var tvServerUrl: TextView
    private lateinit var tvSelectedSummary: TextView
    private lateinit var llFileListContainer: LinearLayout
    private lateinit var btnSelectFiles: Button
    private lateinit var btnBroadcast: Button
    private lateinit var cardLiveBroadcast: CardView
    private lateinit var ivQrCode: ImageView
    private lateinit var tvDirectUrl: TextView
    private lateinit var tvDownloadCount: TextView

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (uris != null && uris.isNotEmpty()) {
            addUrisToSelection(uris)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        setupListeners()
        handleIncomingIntent(intent)
    }

    private fun initViews() {
        tvStatusTitle = findViewById(R.id.tvStatusTitle)
        tvStatusSub = findViewById(R.id.tvStatusSub)
        tvServerUrl = findViewById(R.id.tvServerUrl)
        tvSelectedSummary = findViewById(R.id.tvSelectedSummary)
        llFileListContainer = findViewById(R.id.llFileListContainer)
        btnSelectFiles = findViewById(R.id.btnSelectFiles)
        btnBroadcast = findViewById(R.id.btnBroadcast)
        cardLiveBroadcast = findViewById(R.id.cardLiveBroadcast)
        ivQrCode = findViewById(R.id.ivQrCode)
        tvDirectUrl = findViewById(R.id.tvDirectUrl)
        tvDownloadCount = findViewById(R.id.tvDownloadCount)
    }

    private fun setupListeners() {
        btnSelectFiles.setOnClickListener {
            filePickerLauncher.launch("*/*")
        }

        btnBroadcast.setOnClickListener {
            if (server == null) {
                startBroadcast()
            } else {
                stopBroadcast()
            }
        }
    }

    private fun addUrisToSelection(uris: List<Uri>) {
        for (uri in uris) {
            val file = resolveSharedFile(uri)
            if (file != null && selectedFiles.none { it.uri == uri }) {
                selectedFiles.add(file)
            }
        }
        updateFileListUI()
    }

    private fun resolveSharedFile(uri: Uri): SharedFile? {
        var name = "unknown_file"
        var size = 0L
        val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"

        contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (cursor.moveToFirst()) {
                if (nameIndex != -1) name = cursor.getString(nameIndex) ?: name
                if (sizeIndex != -1) size = cursor.getLong(sizeIndex)
            }
        }

        return SharedFile(
            id = UUID.randomUUID().toString().substring(0, 8),
            name = name,
            size = size,
            mimeType = mimeType,
            uri = uri
        )
    }

    private fun updateFileListUI() {
        llFileListContainer.removeAllViews()

        if (selectedFiles.isEmpty()) {
            tvSelectedSummary.text = "No files selected yet"
            return
        }

        var totalBytes = 0L
        for (file in selectedFiles) {
            totalBytes += file.size

            val itemView = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(16, 12, 16, 12)
                setBackgroundResource(android.R.drawable.dialog_holo_light_frame)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = 8 }
            }

            val tvName = TextView(this).apply {
                text = "${file.name} (${file.getFormattedSize()})"
                textSize = 13f
                setTextColor(resources.getColor(R.color.text_primary, theme))
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }

            val btnRemove = TextView(this).apply {
                text = "✕"
                textSize = 14f
                setTextColor(resources.getColor(R.color.text_secondary, theme))
                setPadding(12, 4, 12, 4)
                setOnClickListener {
                    selectedFiles.remove(file)
                    updateFileListUI()
                    server?.setFiles(selectedFiles)
                }
            }

            itemView.addView(tvName)
            itemView.addView(btnRemove)
            llFileListContainer.addView(itemView)
        }

        tvSelectedSummary.text = "${selectedFiles.size} file(s) selected • ${formatBytes(totalBytes)}"
    }

    private fun startBroadcast() {
        if (selectedFiles.isEmpty()) {
            Toast.makeText(this, "Please select at least one file first!", Toast.LENGTH_SHORT).show()
            return
        }

        try {
            server = LabDropServer(this, 8080) { filename ->
                runOnUiThread {
                    totalDownloads++
                    tvDownloadCount.text = "📥 Total Downloads: $totalDownloads ($filename)"
                    Toast.makeText(this, "Friend downloading: $filename", Toast.LENGTH_SHORT).show()
                }
            }
            server?.setFiles(selectedFiles)
            server?.start()

            val ip = NetworkUtils.getLocalIpAddress()
            val url = "http://$ip:8080"

            tvStatusTitle.text = "🟢 Live Offline Hub"
            tvStatusSub.text = "Streaming files directly to anyone connected to your Wi-Fi or Hotspot."
            tvServerUrl.text = "Access URL: $url"
            tvDirectUrl.text = url

            val qrBitmap = NetworkUtils.generateQrBitmap(url, 512)
            ivQrCode.setImageBitmap(qrBitmap)

            cardLiveBroadcast.visibility = View.VISIBLE
            btnBroadcast.text = "⏹ Stop Broadcasting"
            btnBroadcast.setBackgroundColor(resources.getColor(R.color.primary_dark, theme))

            Toast.makeText(this, "LabDrop Hub started! Friends can scan QR now.", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Failed to start server: ${e.message}", Toast.LENGTH_LONG).show()
            stopBroadcast()
        }
    }

    private fun stopBroadcast() {
        server?.stop()
        server = null

        tvStatusTitle.text = "Offline Lab Broadcaster"
        tvStatusSub.text = "Share lab files to everyone around you without internet or mobile data."
        tvServerUrl.text = "Status: Server stopped"
        cardLiveBroadcast.visibility = View.GONE

        btnBroadcast.text = "⚡ Start Offline Broadcast"
        btnBroadcast.setBackgroundColor(resources.getColor(R.color.primary, theme))
        totalDownloads = 0
        tvDownloadCount.text = "📥 Total Downloads: 0"
    }

    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return
        when (intent.action) {
            Intent.ACTION_SEND -> {
                val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(Intent.EXTRA_STREAM)
                }
                if (uri != null) addUrisToSelection(listOf(uri))
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                val uris = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
                }
                if (uris != null) addUrisToSelection(uris)
            }
        }
    }

    private fun formatBytes(bytes: Long): String {
        if (bytes <= 0) return "0 B"
        val units = arrayOf("B", "KB", "MB", "GB")
        val digitGroups = (Math.log10(bytes.toDouble()) / Math.log10(1024.0)).toInt()
        val num = bytes / Math.pow(1024.0, digitGroups.toDouble())
        return String.format(java.util.Locale.US, "%.1f %s", num, units[digitGroups.coerceIn(0, units.size - 1)])
    }

    override fun onDestroy() {
        super.onDestroy()
        server?.stop()
    }
}
