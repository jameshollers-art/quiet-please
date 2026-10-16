import Foundation
import Capacitor
import GameKit

/// Small Game Center bridge for the game: sign in, report achievements,
/// submit leaderboard scores and open the Game Center dashboard.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportAchievements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showDashboard", returnType: CAPPluginReturnPromise)
    ]

    private var pendingSignIn: [CAPPluginCall] = []

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let player = GKLocalPlayer.local
            if player.isAuthenticated {
                call.resolve(["authenticated": true, "name": player.displayName])
                return
            }
            self.pendingSignIn.append(call)
            if self.pendingSignIn.count > 1 { return }
            player.authenticateHandler = { [weak self] viewController, error in
                guard let self = self else { return }
                if let viewController = viewController {
                    // Game Center wants the player to sign in; show Apple's sheet.
                    self.bridge?.viewController?.present(viewController, animated: true)
                    return
                }
                let calls = self.pendingSignIn
                self.pendingSignIn = []
                for c in calls {
                    if player.isAuthenticated {
                        c.resolve(["authenticated": true, "name": player.displayName])
                    } else {
                        c.resolve(["authenticated": false, "error": error?.localizedDescription ?? ""])
                    }
                }
            }
        }
    }

    @objc func reportAchievements(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { call.resolve(["reported": 0]); return }
        let ids = call.getArray("ids", String.self) ?? []
        if ids.isEmpty { call.resolve(["reported": 0]); return }
        let achievements = ids.map { id -> GKAchievement in
            let a = GKAchievement(identifier: id)
            a.percentComplete = 100
            a.showsCompletionBanner = call.getBool("banner") ?? true
            return a
        }
        GKAchievement.report(achievements) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve(["reported": ids.count]) }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { call.resolve(["submitted": false]); return }
        guard let id = call.getString("leaderboard") else { call.reject("Missing leaderboard"); return }
        let score = call.getInt("score") ?? 0
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [id]) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve(["submitted": true]) }
        }
    }

    @objc func showDashboard(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard GKLocalPlayer.local.isAuthenticated else { call.resolve(["shown": false]); return }
            let vc = GKGameCenterViewController(state: .dashboard)
            vc.gameCenterDelegate = self
            self.bridge?.viewController?.present(vc, animated: true)
            call.resolve(["shown": true])
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
