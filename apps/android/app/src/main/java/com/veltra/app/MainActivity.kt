package com.veltra.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var refresh: SwipeRefreshLayout
    private lateinit var progress: ProgressBar
    private lateinit var errorView: LinearLayout
    private var firstLoadDone = false
    private var mainFrameFailed = false

    private val base: String get() = Prefs.serverUrl(this)
    private val baseUri: Uri get() = Uri.parse(base)

    private val notifPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('veltra:android-notifications',{detail:$granted}))", null)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        val splashStart = System.currentTimeMillis()
        // Keep the branded splash until the first page renders (max 4 s).
        splash.setKeepOnScreenCondition { !firstLoadDone && System.currentTimeMillis() - splashStart < 4000 }
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        refresh = findViewById(R.id.refresh)
        progress = findViewById(R.id.progress)
        errorView = findViewById(R.id.error)

        configureWebView()

        refresh.setColorSchemeResources(R.color.crimson_bright, R.color.rose_gold)
        refresh.setProgressBackgroundColorSchemeResource(R.color.burgundy)
        refresh.setOnRefreshListener { web.reload() }
        // Pull-to-refresh only when the page is scrolled to the top and not on chart screens (charts use drag to pan).
        refresh.setOnChildScrollUpCallback { _, _ -> web.scrollY > 0 || (web.url ?: "").contains("/app/studio") }

        findViewById<Button>(R.id.retry).setOnClickListener { retry() }
        findViewById<Button>(R.id.change_server).apply {
            visibility = if (BuildConfig.DEBUG) View.VISIBLE else View.GONE
            setOnClickListener { promptServerUrl() }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (errorView.visibility == View.VISIBLE) { finish(); return }
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(startUrl(intent))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        web.loadUrl(startUrl(intent))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    /** Builds the URL to open from a notification extra or a veltra://open?path=… deep link. Only same-origin paths. */
    private fun startUrl(intent: Intent?): String {
        val fromNotif = intent?.getStringExtra(Notifications.EXTRA_PATH)
        val fromLink = intent?.data?.takeIf { it.scheme == "veltra" }?.getQueryParameter("path")
        val path = (fromNotif ?: fromLink)?.takeIf { it.startsWith("/") && !it.startsWith("//") && !it.contains("\\") }
        return base + (path ?: "/app")
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, false)
        }
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = true
            setGeolocationEnabled(false)
            userAgentString = "$userAgentString VeltraAndroid/${BuildConfig.VERSION_NAME}"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
        }
        web.addJavascriptInterface(VeltraBridge(this), "VeltraAndroid")

        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress < 100) View.VISIBLE else View.GONE
            }
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                return when {
                    isOwnOrigin(uri) -> false                       // stay inside the app
                    isPaymentHost(uri) -> false                     // Razorpay checkout pages
                    uri.scheme == "http" || uri.scheme == "https" -> { openExternal(uri); true }
                    else -> { openExternal(uri); true }             // upi:, tel:, mailto:, intent: …
                }
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                mainFrameFailed = false
                // The JS bridge is only meaningful on our own origin; the web app checks window.VeltraAndroid.
            }

            override fun onPageFinished(view: WebView, url: String?) {
                refresh.isRefreshing = false
                firstLoadDone = true
                if (!mainFrameFailed) errorView.visibility = View.GONE
                CookieManager.getInstance().flush()
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    mainFrameFailed = true
                    firstLoadDone = true
                    refresh.isRefreshing = false
                    errorView.visibility = View.VISIBLE
                }
            }
        }
    }

    private fun isOwnOrigin(uri: Uri): Boolean =
        uri.scheme == baseUri.scheme && uri.host == baseUri.host && uri.port == baseUri.port

    private fun isPaymentHost(uri: Uri): Boolean =
        uri.scheme == "https" && (uri.host == "api.razorpay.com" || uri.host == "checkout.razorpay.com")

    private fun openExternal(uri: Uri) {
        try {
            val intent = if (uri.scheme == "intent") Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).apply {
                addCategory(Intent.CATEGORY_BROWSABLE); component = null; selector = null
            } else Intent(Intent.ACTION_VIEW, uri)
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        } catch (_: Exception) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    private fun retry() {
        errorView.visibility = View.GONE
        if (web.url.isNullOrEmpty() || web.url == "about:blank") web.loadUrl(base + "/app") else web.reload()
    }

    fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && !Notifications.canPost(this)) notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        else web.evaluateJavascript("window.dispatchEvent(new CustomEvent('veltra:android-notifications',{detail:${Notifications.canPost(this)}}))", null)
    }

    private fun promptServerUrl() {
        val input = EditText(this).apply { setText(base); setSingleLine() }
        AlertDialog.Builder(this)
            .setTitle(R.string.server_dialog_title)
            .setView(input)
            .setPositiveButton(R.string.save) { _, _ ->
                val v = input.text.toString().trim()
                if (v.startsWith("http://") || v.startsWith("https://")) {
                    Prefs.setServerUrl(this, v)
                    errorView.visibility = View.GONE
                    web.loadUrl(Prefs.serverUrl(this) + "/app")
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }
}
