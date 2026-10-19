import UIKit
import WebKit
import Capacitor

/// Registers the app's own native plugins with Capacitor.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())

        // Startup diagnostics: record page errors so a blank screen can explain itself.
        let capture = """
        window.__qpErr = [];
        window.addEventListener('error', function (e) {
          window.__qpErr.push((e.message || 'error') + ' @ ' + (e.filename || '').split('/').pop() + ':' + (e.lineno || 0));
        }, true);
        window.addEventListener('unhandledrejection', function (e) {
          window.__qpErr.push('promise: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
        });
        """
        webView?.configuration.userContentController.addUserScript(
            WKUserScript(source: capture, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if #available(iOS 16.4, *) {
            webView?.isInspectable = true
        }
    }

    private var diagnosed = false

    override open func viewDidLoad() {
        super.viewDidLoad()
        guard !diagnosed else { return }
        diagnosed = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in self?.runDiagnostics() }
    }

    private func runDiagnostics() {
        guard let webView = webView else { showDiagnostics("No web view was created."); return }
        let probe = """
        JSON.stringify({
          href: location.href,
          ready: document.readyState,
          bodyKids: document.body ? document.body.children.length : -1,
          startShown: !!(document.getElementById('startOv') && !document.getElementById('startOv').hidden),
          capacitor: !!window.Capacitor,
          three: typeof THREE,
          size: innerWidth + 'x' + innerHeight,
          errors: (window.__qpErr || []).slice(0, 6)
        })
        """
        let native = "url=\(webView.url?.absoluteString ?? "nil") loading=\(webView.isLoading) " +
            "progress=\(String(format: "%.2f", webView.estimatedProgress)) " +
            "frame=\(Int(webView.frame.width))x\(Int(webView.frame.height)) " +
            "window=\(view.window == nil ? "none" : "ok") hidden=\(webView.isHidden) alpha=\(webView.alpha)"
        webView.evaluateJavaScript(probe) { [weak self] result, error in
            if let error = error {
                self?.showDiagnostics("Page check failed: \(error.localizedDescription)\n\n\(native)")
                return
            }
            let text = (result as? String) ?? "no result"
            self?.showDiagnostics("\(text)\n\n\(native)")
        }
    }

    private func showDiagnostics(_ text: String) {
        let label = UILabel()
        label.numberOfLines = 0
        label.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        label.textColor = .white
        label.backgroundColor = UIColor(red: 0.5, green: 0.1, blue: 0.1, alpha: 0.92)
        label.text = "Quiet, Please startup check (screenshot this, tap to close)\n\n" + text
        label.isUserInteractionEnabled = true
        label.addGestureRecognizer(UITapGestureRecognizer(target: label, action: #selector(UIView.removeFromSuperview)))
        label.translatesAutoresizingMaskIntoConstraints = false
        let host: UIView = view.window ?? view
        host.addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: host.safeAreaLayoutGuide.leadingAnchor, constant: 12),
            label.trailingAnchor.constraint(equalTo: host.safeAreaLayoutGuide.trailingAnchor, constant: -12),
            label.topAnchor.constraint(equalTo: host.safeAreaLayoutGuide.topAnchor, constant: 12)
        ])
    }
}
