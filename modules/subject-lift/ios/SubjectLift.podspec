Pod::Spec.new do |s|
  s.name           = 'SubjectLift'
  s.version        = '1.0.0'
  s.summary        = 'On-device subject lift (background removal) via iOS Vision.'
  s.description     = 'Lifts the foreground subject from a photo into a transparent PNG using VNGenerateForegroundInstanceMaskRequest (iOS 17+).'
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
