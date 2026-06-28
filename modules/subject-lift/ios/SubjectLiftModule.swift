import ExpoModulesCore
import Vision
import UIKit
import CoreImage

// Нативная вырезка предмета из фона на устройстве (iOS 17+).
// Использует Vision `VNGenerateForegroundInstanceMaskRequest` — ту же технологию,
// что «поднимает» предмет в системном приложении «Фото». Возвращает file:// PNG
// с прозрачным фоном. Бесплатно, офлайн, без скачивания моделей.
public class SubjectLiftModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SubjectLift")

    AsyncFunction("liftToPNG") { (uri: String, promise: Promise) in
      guard #available(iOS 17.0, *) else {
        promise.reject("UNSUPPORTED", "Subject lifting requires iOS 17 or newer")
        return
      }

      // Тяжёлую работу — в фоновый поток, чтобы не блокировать UI.
      DispatchQueue.global(qos: .userInitiated).async {
        // Грузим картинку (поддерживаем file:// и обычный путь).
        let fileURL = URL(string: uri) ?? URL(fileURLWithPath: uri)
        guard
          let data = try? Data(contentsOf: fileURL),
          let uiImage = UIImage(data: data),
          let cgImage = uiImage.cgImage
        else {
          promise.reject("BAD_IMAGE", "Could not load image at \(uri)")
          return
        }

        let orientation = Self.cgOrientation(from: uiImage.imageOrientation)
        let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
        let request = VNGenerateForegroundInstanceMaskRequest()

        do {
          try handler.perform([request])
          guard let observation = request.results?.first else {
            promise.reject("NO_SUBJECT", "No foreground subject found")
            return
          }

          // Маскируем все найденные инстансы и обрезаем по их границам.
          let maskedBuffer = try observation.generateMaskedImage(
            ofInstances: observation.allInstances,
            from: handler,
            croppedToInstancesExtent: true
          )

          let ciImage = CIImage(cvPixelBuffer: maskedBuffer)
          let context = CIContext()
          guard let outCg = context.createCGImage(ciImage, from: ciImage.extent) else {
            promise.reject("RENDER_FAILED", "Could not render masked image")
            return
          }

          let outImage = UIImage(cgImage: outCg)
          guard let png = outImage.pngData() else {
            promise.reject("ENCODE_FAILED", "Could not encode PNG")
            return
          }

          let name = "cw-cutout-\(Int(Date().timeIntervalSince1970 * 1000)).png"
          let outURL = FileManager.default.temporaryDirectory.appendingPathComponent(name)
          try png.write(to: outURL)
          promise.resolve(outURL.absoluteString)
        } catch {
          promise.reject("LIFT_FAILED", error.localizedDescription)
        }
      }
    }
  }

  // UIImage.Orientation → CGImagePropertyOrientation (чтобы маска совпала с кадром).
  private static func cgOrientation(from orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch orientation {
    case .up: return .up
    case .upMirrored: return .upMirrored
    case .down: return .down
    case .downMirrored: return .downMirrored
    case .left: return .left
    case .leftMirrored: return .leftMirrored
    case .right: return .right
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
