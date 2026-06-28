import ExpoModulesCore
import AVFoundation

// Настраивает аудио-сессию iOS так, чтобы озвучка (expo-speech) звучала ДАЖЕ в
// беззвучном режиме — как в Duolingo/ELSA. Категория `.playback` обходит
// переключатель «без звука»; `.mixWithOthers` позволяет произношению звучать
// поверх чужой музыки, не выключая её.
public class AudioSessionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioSession")

    Function("configureForPlayback") { () -> Bool in
      do {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers])
        try session.setActive(true)
        return true
      } catch {
        return false
      }
    }
  }
}
