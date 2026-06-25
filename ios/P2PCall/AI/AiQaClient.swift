import Foundation

/// REST client for meeting Q&A. Posts the transcript + a question to the FastAPI
/// AI server (`/ask`), which answers using the local Ollama LLM. Mirrors
/// Android's `AiQaClient`.
final class AiQaClient {

    private let askUrl: String
    private let session: URLSession

    init(askUrl: String) {
        self.askUrl = askUrl
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 90
        self.session = URLSession(configuration: config)
    }

    func ask(transcript: String, question: String) async throws -> String {
        guard let url = URL(string: askUrl) else { throw AiError.badResponse }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(
            withJSONObject: ["transcript": transcript, "question": question]
        )

        let (data, response) = try await session.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw AiError.server(code, String(data: data, encoding: .utf8) ?? "")
        }
        guard let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            throw AiError.badResponse
        }
        return (obj["answer"] as? String) ?? ""
    }
}
