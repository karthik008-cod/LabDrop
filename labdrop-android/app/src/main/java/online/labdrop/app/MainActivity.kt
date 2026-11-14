package online.labdrop.app

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private var server: LabDropServer? = null
    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var llHotspotBanner: LinearLayout
    private lateinit var tvHotspotIp: TextView

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (filePathCallback == null) return@registerForActivityResult

        val uris = mutableListOf<Uri>()
        val data = result.data

        if (result.resultCode == RESULT_OK && data != null) {
            val clipData = data.clipData
            if (clipData != null) {
                for (i in 0 until clipData.itemCount) {
                    uris.add(clipData.getItemAt(i).uri)
                }
            } else if (data.data != null) {
                uris.add(data.data!!)
            }
        }

        filePathCallback?.onReceiveValue(if (uris.isNotEmpty()) uris.toTypedArray() else null)
        filePathCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        startOfflineServer()
        setupWebView()
    }

    private fun initViews() {
        webView = findViewById(R.id.webView)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        llHotspotBanner = findViewById(R.id.llHotspotBanner)
        tvHotspotIp = findViewById(R.id.tvHotspotIp)

        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }
    }

    private fun startOfflineServer() {
        try {
            server = LabDropServer(this, 8080) { fileName ->
                runOnUiThread {
                    Toast.makeText(this, "Friend downloading: $fileName", Toast.LENGTH_SHORT).show()
                }
            }
            server?.start()

            // Keep floating banner hidden until offline transfer is explicitly created
            llHotspotBanner.visibility = View.GONE
        } catch (e: Exception) {
            tvHotspotIp.text = "Local Server Error: ${e.message}"
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.cacheMode = WebSettings.LOAD_NO_CACHE

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefresh.isRefreshing = false
            }

            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url == null) return false
                if (url.contains("/download/")) {
                    startFileDownload(url)
                    return true
                }
                return false
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                mWebView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    addCategory(Intent.CATEGORY_OPENABLE)
                }

                try {
                    fileChooserLauncher.launch(Intent.createChooser(intent, "Select Files to Transfer"))
                } catch (e: Exception) {
                    this@MainActivity.filePathCallback = null
                    return false
                }
                return true
            }
        }

        webView.setDownloadListener { url, userAgent, contentDisposition, mimetype, contentLength ->
            startFileDownload(url, contentDisposition, mimetype)
        }

        webView.addJavascriptInterface(WebAppInterface(this), "AndroidBridge")

        // Load the local full LabDrop web application
        webView.loadUrl("http://127.0.0.1:8080")
    }

    class WebAppInterface(private val activity: MainActivity) {
        @JavascriptInterface
        fun showOfflineTransferCreated(code: String, url: String) {
            activity.runOnUiThread {
                val ip = NetworkUtils.getLocalIpAddress()
                activity.tvHotspotIp.text = "Offline Hub Active • Code: $code"
                activity.llHotspotBanner.visibility = View.VISIBLE
                activity.llHotspotBanner.setOnClickListener {
                    Toast.makeText(activity, "Code: $code\nOpen in browser: $url", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun hideOfflineBanner() {
            activity.runOnUiThread {
                activity.llHotspotBanner.visibility = View.GONE
            }
        }
    }

    private fun startFileDownload(url: String, contentDisposition: String? = null, mimetype: String? = null) {
        try {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                val filename = URLUtil.guessFileName(url, contentDisposition, mimetype ?: "application/octet-stream")
                setTitle(filename)
                setDescription("Downloading from LabDrop")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
            }
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)
            Toast.makeText(this, "Downloading file...", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Download failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        server?.stop()
    }
}
