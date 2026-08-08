import Capacitor
import FirebaseMessaging

// Plugin Capacitor nativo para exponer el FCM token al JS via APIs oficiales de Capacitor.
// Reemplaza el puente ad-hoc WKScriptMessageHandler + evaluateJavaScript de PUSH-01b.
//
// Registrado via bridge.registerPluginInstance() en SceneDelegate.willConnectTo.
// AppDelegate.MessagingDelegate llama notifyFCMToken(_:) cuando Firebase entrega el token.
// JS usa OrbiPush.addListener("fcmToken", handler) y OrbiPush.getToken() — sin CustomEvent.

@objc(OrbiPushPlugin)
public class OrbiPushPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OrbiPushPlugin"
    public let jsName = "OrbiPush"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getToken", returnType: CAPPluginReturnPromise)
    ]

    // Llamado desde JS: Capacitor.Plugins.OrbiPush.getToken()
    // Consulta Messaging.messaging().token — devuelve el token FCM actual (caché o Firebase).
    // Determinista: siempre devuelve el token vigente aunque MessagingDelegate no haya refrescado.
    @objc func getToken(_ call: CAPPluginCall) {
        Messaging.messaging().token { token, error in
            if let token = token {
                call.resolve(["token": token])
            } else {
                call.reject(error?.localizedDescription ?? "FCM token no disponible")
            }
        }
    }

    // Llamado desde AppDelegate.MessagingDelegate cuando Firebase entrega un token nuevo o rotado.
    // notifyListeners es la API oficial de CAPPlugin para despachar eventos al JS registrado via addListener.
    func notifyFCMToken(_ token: String) {
        notifyListeners("fcmToken", data: ["token": token])
    }
}
