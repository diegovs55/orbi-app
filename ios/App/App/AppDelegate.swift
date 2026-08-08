import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// Firebase entrega el FCM token aquí — nuevo token, token rotado, o cold start con token existente.
// El token se despacha a OrbiPushPlugin via la API oficial de Capacitor (notifyListeners).
// OrbiPushPlugin fue registrado en SceneDelegate via bridge.registerPluginInstance().
extension AppDelegate: MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken = fcmToken else { return }
        print("[PUSH] FCM token recibido por MessagingDelegate, len=\(fcmToken.count)")
        DispatchQueue.main.async {
            guard
                let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                let rootVC = scene.windows.first?.rootViewController as? CAPBridgeViewController,
                let plugin = rootVC.bridge?.plugin(withName: "OrbiPush") as? OrbiPushPlugin
            else {
                print("[PUSH] OrbiPushPlugin no disponible aún — token llegó antes del bridge")
                return
            }
            plugin.notifyFCMToken(fcmToken)
        }
    }
}
