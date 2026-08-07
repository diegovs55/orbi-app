import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    // Guard para evitar doble registro si scene(_:willConnectTo:) se llama más de una vez.
    private var orbiPushHandlerRegistered = false

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()
        // Registrar el handler después de makeKeyAndVisible: bridge?.webView ya no es nil,
        // pero el JS aún no ha evaluado nada. Punto determinista más temprano posible.
        registerOrbiPushHandler()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        guard orbiPushHandlerRegistered,
              let rootVC = window?.rootViewController as? CAPBridgeViewController,
              let webView = rootVC.bridge?.webView
        else { return }
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "orbiPush")
        orbiPushHandlerRegistered = false
    }

    private func registerOrbiPushHandler() {
        guard !orbiPushHandlerRegistered,
              let rootVC = window?.rootViewController as? CAPBridgeViewController,
              let webView = rootVC.bridge?.webView,
              let appDelegate = UIApplication.shared.delegate as? AppDelegate
        else { return }
        let weakHandler = WeakScriptMessageHandler(appDelegate)
        webView.configuration.userContentController.add(weakHandler, name: "orbiPush")
        orbiPushHandlerRegistered = true
        print("[PUSH] WKScriptMessageHandler 'orbiPush' registrado")
    }
}
