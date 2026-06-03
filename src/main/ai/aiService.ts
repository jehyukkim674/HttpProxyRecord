import Anthropic from '@anthropic-ai/sdk';
import { summarizeRecordForAI, summarizeRecordsForAI } from './aiPrompts';
import type { TrafficRecord } from '../../shared/types';

const MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 4096;

const NO_KEY_MESSAGE = 'Claude API 키가 설정되지 않았어요. 설정에서 키를 입력하세요.';

/** Claude API 기반 AI 기능. 키는 설정에서 주입, 없으면 graceful degradation. */
export class AIService {
  constructor(private readonly getApiKey: () => string | null) {}

  hasKey(): boolean {
    return Boolean(this.getApiKey() || process.env.ANTHROPIC_API_KEY);
  }

  private client(): Anthropic {
    const apiKey = this.getApiKey() || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error(NO_KEY_MESSAGE);
    return new Anthropic({ apiKey });
  }

  private async ask(system: string, user: string): Promise<string> {
    const response = await this.client().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system,
      messages: [{ role: 'user', content: user }],
    });
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
  }

  /** #21 응답 설명: 이 엔드포인트가 무엇을 하는지 한국어로 설명 */
  async explainResponse(record: TrafficRecord): Promise<string> {
    return this.ask(
      '너는 HTTP API 분석가야. 주어진 요청/응답을 보고 이 엔드포인트가 무엇을 하는지, 응답이 무엇을 의미하는지 한국어로 간결하게 설명해.',
      summarizeRecordForAI(record),
    );
  }

  /** #22 이상 탐지: 비정상 응답·느린 요청·에러 패턴 */
  async detectAnomalies(records: TrafficRecord[]): Promise<string> {
    return this.ask(
      '너는 HTTP 트래픽 분석가야. 트래픽 목록에서 이상 징후(에러 급증, 비정상적으로 느린 요청, 의심스러운 패턴)를 찾아 한국어로 정리해. 이상이 없으면 없다고 말해.',
      summarizeRecordsForAI(records),
    );
  }

  /** #24 테스트 케이스 생성: 엣지케이스 제안 */
  async generateTests(record: TrafficRecord): Promise<string> {
    return this.ask(
      '너는 QA 엔지니어야. 주어진 API 요청을 바탕으로 점검하면 좋은 엣지케이스 테스트를 한국어로 목록화해(경계값, 인증 실패, 잘못된 입력 등).',
      summarizeRecordForAI(record),
    );
  }

  /** #23 자연어 검색: 질의에 맞는 트래픽 id 배열 반환 */
  async naturalLanguageSearch(query: string, records: TrafficRecord[]): Promise<number[]> {
    const response = await this.client().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system:
        '너는 트래픽 검색 도우미야. 사용자 질의에 맞는 트래픽의 id만 JSON 배열로 반환해. 예: [1, 5, 9]. 매칭이 없으면 [].',
      messages: [
        {
          role: 'user',
          content: `질의: ${query}\n\n트래픽 목록:\n${summarizeRecordsForAI(records)}\n\n매칭되는 id를 JSON 배열로만 답해.`,
        },
      ],
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const match = text.match(/\[[\d,\s]*\]/);
    if (!match) return [];
    try {
      const ids = JSON.parse(match[0]) as number[];
      return ids.filter((id) => typeof id === 'number');
    } catch {
      return [];
    }
  }
}
