import Foundation
import ApplicationServices
import ScreenCaptureKit
import ImageIO
import UniformTypeIdentifiers

// Minimal permission handling (non-production).
// Usage:
//   MonitorHelper request-permissions
// Prints: screen=granted|denied accessibility=granted|denied

func requestScreenRecording() async -> Bool {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            return false
        }
        let config = SCStreamConfiguration()
        config.width = display.width
        config.height = display.height
        config.showsCursor = true
        let filter = SCContentFilter(display: display, excludingWindows: [])
        _ = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        return true
    } catch {
        return false
    }
}

func accessibilityStatus() -> Bool {
    return AXIsProcessTrusted()
}

func captureAndSaveScreenshot() async throws -> String {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    guard let display = content.displays.first else {
        throw NSError(domain: "MonitorHelper", code: 1, userInfo: [NSLocalizedDescriptionKey: "no_display"])
    }
    let config = SCStreamConfiguration()
    config.width = display.width
    config.height = display.height
    config.showsCursor = true
    let filter = SCContentFilter(display: display, excludingWindows: [])
    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)

    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("screenshot-\(UUID().uuidString).png")
    guard let destination = CGImageDestinationCreateWithURL(
        url as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
    ) else {
        throw NSError(domain: "MonitorHelper", code: 2, userInfo: [NSLocalizedDescriptionKey: "destination_failed"])
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw NSError(domain: "MonitorHelper", code: 3, userInfo: [NSLocalizedDescriptionKey: "write_failed"])
    }
    return url.path
}

let args = CommandLine.arguments
if args.contains("request-permissions") {
    Task {
        let screen = await requestScreenRecording()
        let accessibility = accessibilityStatus()
        let screenStatus = screen ? "granted" : "denied"
        let accessibilityStatus = accessibility ? "granted" : "denied"
        print("screen=\(screenStatus) accessibility=\(accessibilityStatus)")
        exit(0)
    }
    dispatchMain()
}

// Stub: capture one frame (not production).
// Usage:
//   MonitorHelper capture-once
if args.contains("capture-once") {
    Task {
        do {
            let path = try await captureAndSaveScreenshot()
            print(path)
            exit(0)
        } catch {
            print("error=\(error)")
            exit(1)
        }
    }
    dispatchMain()
}

print("MonitorHelper skeleton")
