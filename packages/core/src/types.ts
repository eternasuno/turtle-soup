export interface Puzzle {
  id: string;
  title: string;
  surface: string;
  truth: string;
  keyFacts: string[];
}
export interface JevSettings {
  apiUrl: string;
  apiKey: string;
}
export type GameMode = 'question' | 'solve';
export type GameStatus = 'playing' | 'solved' | 'revealed';
export type Message = {
  id: string;
  role: 'user' | 'host';
  mode?: GameMode;
  content: string;
};
export type QuestionAnswer = 'yes' | 'no' | 'irrelevant' | 'unknown';
export type QuestionResult = { answer: QuestionAnswer };
export type FactMatch = { fact: string; matched: boolean; confidence?: number };
export type SolutionStatus = 'correct' | 'partial' | 'wrong';
export type SolutionResult = { status: SolutionStatus; facts: FactMatch[] };
