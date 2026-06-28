Pod::Spec.new do |s|
  s.name           = 'AudioSession'
  s.version        = '1.0.0'
  s.summary        = 'Configure the iOS audio session for speech playback in silent mode.'
  s.description     = 'Sets AVAudioSession to the .playback category so expo-speech is audible even when the ringer switch is on silent.'
  s.author         = ''
  s.homepage       = 'https://catchword.app'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
