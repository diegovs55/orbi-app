import UIKit
import WebKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

// Rompe el ciclo de retención fuerte WKUserContentController → handler.
// WKUserContentController retiene fuertemente al handler; este wrapper lo retiene débilmente
// para que AppDelegate pueda ser deallocado normalmente.
class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?
    init(_ delegate: WKScriptMessageHandler) { self.delegate = delegate }
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(ucc, didReceive: message)
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// PUSH-01e: recibe el FCM token del delegate de Firebase y lo despacha al JS via evaluateJavaScript.
// PUSH-01b fix: también responde solicitudes síncronas de JS via WKScriptMessageHandler("orbiPush"),
// consultando Messaging.messaging().token que siempre devuelve el token actual (caché o Firebase).
// Se serializa con JSONEncoder para evitar inyección si el token contiene caracteres especiales.
// PushSetup.tsx escucha el CustomEvent 'fcmTokenReceived' en window.
extension AppDelegate: MessagingDelegate {
    // Token FCM recibido del delegate (token nuevo o rotado). También llega en cold start con token nuevo.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken = fcmToken else { return }
        print("[PUSH] FCM token recibido por delegate, len=\(fcmToken.count)")
        dispatchFCMTokenToWebView(fcmToken)
    }
}

extension AppDelegate: WKScriptMessageHandler {
    // PushSetup.tsx llama postMessage({type:"getToken"}) después de PushNotifications.register().
    // Responde con el FCM token actual via Messaging.messaging().token (determinista).
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "orbiPush" else { return }
        Messaging.messaging().token { [weak self] token, error in
            guard let token = token, error == nil else {
                print("[PUSH] Error obteniendo FCM token bajo demanda: \(error?.localizedDescription ?? "nil")")
                return
            }
            self?.dispatchFCMTokenToWebView(token)
        }
    }
}

extension AppDelegate {
    // Token deduplicado: no redespacha el mismo token dos veces en la misma sesión de la app.
    // La propiedad se declara via objc_getAssociatedObject para evitar stored properties en extensions.
    private static var _lastDispatchedFCMToken: String? = nil

    private func dispatchFCMTokenToWebView(_ fcmToken: String) {
        guard fcmToken != AppDelegate._lastDispatchedFCMToken else {
            print("[PUSH] Token sin cambios, dispatch omitido")
            return
        }
        AppDelegate._lastDispatchedFCMToken = fcmToken
        DispatchQueue.main.async {
            guard
                let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                let rootVC = scene.windows.first?.rootViewController as? CAPBridgeViewController,
                let data = try? JSONEncoder().encode(["token": fcmToken]),
                let json = String(data: data, encoding: .utf8)
            else {
                print("[PUSH] No se pudo obtener el bridge de Capacitor")
                return
            }
            let js = "window.dispatchEvent(new CustomEvent('fcmTokenReceived',{detail:\(json)}))"
            rootVC.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}
