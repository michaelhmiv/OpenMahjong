import XCTest

/// IOS-SMOKE: behavioral boot/flow smoke for the packaged Open Mahjong
/// app (brief-ios-v1 step 2, acceptance check 2).
///
/// Modeled on Munch's MunchSmokeTests.swift, adapted to this app: the
/// packaged bundle is the real local bundle built by
/// .github/workflows/mobile-ios.yml (job `smoke`) with NO fixture swap
/// and NO credentials — Open Mahjong's CPU play is fully local, and
/// guests play everything, so the journey runs entirely against the
/// shipped bundle offline:
///
///   launch → Play screen renders → start a CPU game → game table
///   renders and settles → relaunch to the Play root → open the
///   Learn tab → return to Play.
///
/// The return from the table is a cold relaunch, not the pause
/// menu's "Quit to home" — a measured shell finding, recorded here
/// so nobody re-adds the Menu tap blindly: the table header renders
/// UNDER the iOS status bar in the packaged shell (the Menu
/// button's AX frame is {{12, 0}, {46, 46}}, overlapping the status
/// bar row in captures), and XCUITest-synthesized touches in that
/// band are delivered to the system, not the webview. CI run
/// 44843947635 tapped the button's center (35, 23) and run
/// 44846211221 tapped low in its frame (35, 41.4) on a settled
/// game; neither opened the pause overlay, and the failure
/// hierarchies show no overlay. Every tap below the header band
/// (Play CTA at (201, 537), the tab bar) works. The relaunch leg
/// is a real user path — the in-progress game persists (loadGame),
/// so the Play root returns with its Continue offer — and the
/// brief's journey (Play → CPU game → Learn → Play) is unchanged.
///
/// Assertions are made against the WKWebView accessibility tree (the
/// same surface VoiceOver users get), not just screenshots: each step
/// waits for elements that only exist when that screen actually
/// rendered, and screenshots are attached per step for the run
/// artifacts. Markers (all guest-visible in the local bundle, from
/// packages/web/src/app.ts):
///   Play  — wordmark "OPEN MAHJONG" (renderPlay), the variant seg's
///           "Riichi" radio, the "East only" length seg, and the
///           primary Play button (exact label "Play").
///   Table — the hand-controls "Inspect hand" button and the header
///           Menu button (aria-label "Menu") in renderTable, plus
///           the center label's "Wall 69": the human is always the
///           East 1 dealer, so the dealer's first draw (Wall 70 →
///           69) is the terminal playback event, after which the
///           runner blocks on the human's discard.
///   Learn — the "Learn" heading, its intro line "Lessons teach each
///           game from the first tile", and the "Practice" button in
///           renderLearn.
final class OpenMahjongSmokeTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    override func tearDownWithError() throws {
        app = nil
    }

    // MARK: - Journeys

    /// The brief's smoke journey: boot → Play renders → CPU game →
    /// table renders → Learn → back to Play.
    func test01_PlayCpuGameLearnAndBack() throws {
        // Step 1 — cold boot lands on the Play root with the shipped
        // bundle rendered (not a blank webview).
        assertPlayRendered(step: "cold launch")
        attachScreenshot("01-play")

        // Step 2 — one tap on the Play button starts a local CPU game
        // (riichi, the default variant/length) and the table renders.
        tapPlayButton()
        XCTAssertTrue(
            waitForText("Inspect hand", timeout: 60),
            "Game table never rendered its hand controls after Play"
        )
        XCTAssertTrue(
            buttons(withExactLabel: "Menu").firstMatch.exists,
            "Game table is missing its Menu button"
        )
        XCTAssertFalse(
            anyElement(containingText: "Lessons teach each game").exists,
            "Learn screen rendered while a game should be running"
        )

        // Settle gate — the game must reach the human's first
        // decision before the table counts as rendered. startGame
        // plays the deal back event by event (each event re-renders
        // the table), so "Inspect hand" alone can appear mid-deal;
        // "Wall 69" cannot: the human is always the East 1 dealer,
        // the dealer's first draw (Wall 70 → 69) is the last playback
        // event, and after it the runner blocks on the human's
        // discard. The 2 s cushion lets onSettled's final render
        // land (per-event playback delays are ≤ 260 ms).
        XCTAssertTrue(
            waitForText("Wall 69", timeout: 60),
            "Game never settled on the human's first decision (Wall 69)"
        )
        Thread.sleep(forTimeInterval: 2.0)
        attachScreenshot("02-table")

        // Step 3 — cold relaunch returns to the Play root, with the
        // in-progress game persisted (its Continue offer replaces
        // the fresh-state motif row; the wordmark, segs, and Play
        // button the Play assertions check render in both states).
        // The pause-menu exit is not used: the table header renders
        // under the status bar and its buttons are unreachable to
        // synthesized touches (see the class comment).
        app.terminate()
        app.launch()
        assertPlayRendered(step: "relaunch from the table")
        attachScreenshot("03-play-after-relaunch")

        // Step 4 — the Learn tab renders its lessons index.
        tapHittable(buttons(withExactLabel: "Learn"), "bottom-nav Learn tab")
        XCTAssertTrue(
            waitForText("Lessons teach each game from the first tile", timeout: 30),
            "Learn screen never rendered its intro"
        )
        XCTAssertTrue(
            buttons(containing: "Practice").firstMatch.exists,
            "Learn screen is missing its Practice entry"
        )
        attachScreenshot("04-learn")

        // Step 5 — back to the Play tab, which re-renders the Play root.
        tapHittable(buttons(withExactLabel: "Play"), "bottom-nav Play tab")
        assertPlayRendered(step: "return from Learn")
        attachScreenshot("05-play-returned")
    }

    /// A second cold launch must land on the same guest Play root:
    /// no sign-in wall, no network dependency, no persisted state
    /// required for the shell to render.
    func test02_RelaunchLandsOnPlay() throws {
        assertPlayRendered(step: "persistence check, first launch")
        app.terminate()
        app.launch()
        assertPlayRendered(step: "persistence check, relaunch")
        attachScreenshot("06-relaunch-play")
    }

    // MARK: - Flow helpers

    private func assertPlayRendered(step: String) {
        XCTAssertTrue(
            waitForPlaySurface(timeout: 60),
            "Play screen never rendered (wordmark + Play button + Riichi seg) — \(step)"
        )
    }

    /// Poll for the Play root's markers. If NOTHING renders within the
    /// window — the nothing-rendered signature of a stalled cold start
    /// (a webview whose accessibility tree holds only scroll bars on a
    /// live process; the failure mode Munch's smoke documented in run
    /// 42747596417) — the app is relaunched ONCE and the wait repeated.
    /// A wedged first WebContent spin-up does not recover by waiting
    /// on the same process; a fresh launch is the deterministic
    /// remedy. This is not retry-until-green: it fires only when
    /// nothing rendered at all, and a second no-render still fails.
    private func waitForPlaySurface(timeout: TimeInterval) -> Bool {
        if pollForPlaySurface(timeout: timeout) { return true }
        app.terminate()
        app.launch()
        return pollForPlaySurface(timeout: timeout)
    }

    private func pollForPlaySurface(timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if anyElement(containingText: "OPEN MAHJONG").exists
                && buttons(withExactLabel: "Play").count > 0
                && anyElement(containingText: "Riichi").exists {
                return true
            }
            Thread.sleep(forTimeInterval: 0.5)
        }
        return false
    }

    /// Tap the Play screen's primary Play button. Two webview buttons
    /// carry the exact label "Play": the CTA (mid-screen) and the
    /// bottom-nav Play tab (bottom edge). The CTA is the one higher
    /// on screen, so pick the hittable match with the smallest
    /// vertical origin — never the tab.
    private func tapPlayButton() {
        let query = buttons(withExactLabel: "Play")
        let deadline = Date().addingTimeInterval(30)
        while Date() < deadline {
            var best: XCUIElement?
            for index in 0..<query.count {
                let candidate = query.element(boundBy: index)
                guard candidate.exists, candidate.isHittable else { continue }
                if let current = best {
                    if candidate.frame.minY < current.frame.minY { best = candidate }
                } else {
                    best = candidate
                }
            }
            if let target = best {
                target.tap()
                return
            }
            Thread.sleep(forTimeInterval: 0.5)
        }
        XCTFail("Play button never became hittable")
    }

    // MARK: - Element helpers

    private var webView: XCUIElement {
        app.webViews.firstMatch
    }

    private func anyElement(containingText text: String) -> XCUIElement {
        webView
            .descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS[c] %@", text))
            .firstMatch
    }

    private func waitForText(_ text: String, timeout: TimeInterval) -> Bool {
        anyElement(containingText: text).waitForExistence(timeout: timeout)
    }

    /// Tap the hittable element among a query's matches. Web content
    /// can expose a same-labelled element in a surface that is hidden
    /// or off-screen, so this polls every match for hittability
    /// instead of trusting firstMatch or existence.
    private func tapHittable(_ query: XCUIElementQuery, _ description: String) {
        let deadline = Date().addingTimeInterval(30)
        while Date() < deadline {
            for index in 0..<query.count {
                let candidate = query.element(boundBy: index)
                if candidate.exists && candidate.isHittable {
                    candidate.tap()
                    return
                }
            }
            Thread.sleep(forTimeInterval: 0.5)
        }
        XCTFail("\(description) never became hittable")
    }

    private func buttons(containing text: String) -> XCUIElementQuery {
        webView.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", text))
    }

    private func buttons(withExactLabel label: String) -> XCUIElementQuery {
        webView.buttons.matching(NSPredicate(format: "label == %@", label))
    }

    private func attachScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
