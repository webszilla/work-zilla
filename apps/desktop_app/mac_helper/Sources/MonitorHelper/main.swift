import Foundation
import ApplicationServices
import ScreenCaptureKit
import ImageIO
import UniformTypeIdentifiers

// Minimal permission handling (non-production).
// Usage:
//   MonitorHelper request-permissions
// Prints: screen=granted|denied accessibility=granted|denied

func timestampLabel() -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMMdd-HHmmss"
    formatter.locale = Locale(identifier: "en_US_POSIX")
    return formatter.string(from: Date())
}

func requestScreenRecording() async -> Bool {
    if #available(macOS 14.0, *) {
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
    } else {
        if let image = CGDisplayCreateImage(CGMainDisplayID()) {
            return image.width > 0 && image.height > 0
        }
        return false
    }
}

func accessibilityStatus() -> Bool {
    return AXIsProcessTrusted()
}

func captureAndSaveScreenshot() async throws -> String {
    if #available(macOS 14.0, *) {
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

        let filename = "screenshot-\(timestampLabel())-\(UUID().uuidString).png"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
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
    } else {
        guard let image = CGDisplayCreateImage(CGMainDisplayID()) else {
            throw NSError(domain: "MonitorHelper", code: 4, userInfo: [NSLocalizedDescriptionKey: "capture_failed"])
        }
        let filename = "screenshot-\(timestampLabel())-\(UUID().uuidString).png"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
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
