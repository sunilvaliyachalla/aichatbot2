import Foundation

/// Result of a meeting summary request.
struct CallSummary {
    let summary: String
    let actionItems: [String]
}

enum AiError: LocalizedError {
    case server(Int, String)
    case badResponse

    var errorDescription: String? {
        switch self {
        case .server(let code, let body): return "(\(code)): \(body)"
        case .badResponse: return "Unexpected response"
        }
    }
}

/// REST client for end-of-call summaries. Posts the accumulated transcript to
/// the FastAPI AI server (`/summarize`), which uses the local Ollama LLM.
/// Mirrors Android's `AiSummaryClient`.
final class AiSummaryClient {

    private let summaryUrl: String
    private let session: URLSession

    init(summaryUrl: String) {
        self.summaryUrl = summaryUrl
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 90
        self.session = URLSession(configuration: config)
    }

    func summarize(_ transcript: String) async throws -> CallSummary {
        guard let url = URL(string: summaryUrl) else { throw AiError.badResponse }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["transcript": transcript])

        let (data, response) = try await session.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw AiError.server(code, String(data: data, encoding: .utf8) ?? "")
        }
        guard let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            throw AiError.badResponse
        }
        let summary = (obj["summary"] as? String) ?? ""
        let actionItems = (obj["action_items"] as? [Any])?.compactMap { $0 as? String } ?? []
        return CallSummary(summary: summary, actionItems: actionItems)
    }
}
