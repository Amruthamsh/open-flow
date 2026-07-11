#!/usr/bin/env swift

import Foundation
import AVFoundation
import Speech

class VoiceRecognizer: NSObject {
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-IN"))!
    private var silenceTimer: Timer?
    private var lastTranscript = ""
    private let silenceTimeout: TimeInterval = 2.0
    private var hasOutput = false

    func start() {
        SFSpeechRecognizer.requestAuthorization { status in
            switch status {
            case .authorized:
                self.startRecording()
            default:
                self.output(error: "Speech recognition not authorized. Grant permission in System Settings > Privacy & Security > Speech Recognition.")
            }
        }
        RunLoop.main.run()
    }

    private func startRecording() {
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else {
            output(error: "Failed to create recognition request")
            return
        }

        recognitionRequest.shouldReportPartialResults = true

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            recognitionRequest.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            output(error: "Audio engine failed to start: \(error.localizedDescription)")
            return
        }

        // Print ready signal to stderr so frontend knows we're listening
        FileHandle.standardError.write("LISTENING\n".data(using: .utf8)!)

        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            if let result = result {
                self.lastTranscript = result.bestTranscription.formattedString

                // Reset silence timer on each new result
                self.silenceTimer?.invalidate()
                self.silenceTimer = Timer.scheduledTimer(withTimeInterval: self.silenceTimeout, repeats: false) { _ in
                    self.finish()
                }

                if result.isFinal {
                    self.finish()
                }
            }

            if let error = error {
                if !self.hasOutput {
                    self.output(error: error.localizedDescription)
                }
            }
        }

        // Overall timeout of 15 seconds
        Timer.scheduledTimer(withTimeInterval: 15.0, repeats: false) { [weak self] _ in
            self?.finish()
        }
    }

    private func finish() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()

        if !hasOutput {
            hasOutput = true
            if lastTranscript.isEmpty {
                output(error: "No speech detected")
            } else {
                // Output the transcript as JSON to stdout
                let result: [String: Any] = [
                    "transcript": lastTranscript,
                    "confidence": 1.0
                ]
                if let data = try? JSONSerialization.data(withJSONObject: result),
                   let json = String(data: data, encoding: .utf8) {
                    print(json)
                }
            }
            exit(0)
        }
    }

    private func output(error: String) {
        hasOutput = true
        let result: [String: Any] = ["error": error]
        if let data = try? JSONSerialization.data(withJSONObject: result),
           let json = String(data: data, encoding: .utf8) {
            print(json)
        }
        exit(1)
    }
}

let recognizer = VoiceRecognizer()
recognizer.start()
