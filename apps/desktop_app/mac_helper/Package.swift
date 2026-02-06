// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "MonitorHelper",
  platforms: [
    .macOS(.v13)
  ],
  targets: [
    .executableTarget(
      name: "MonitorHelper",
      path: "Sources/MonitorHelper"
    )
  ]
)
