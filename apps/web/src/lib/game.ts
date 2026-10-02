import {
  questionLabels,
  selectPuzzle,
  solutionLabels,
} from '@turtle-soup/core/game';
import {
  askQuestion,
  evaluateSolution,
  JEV_ERROR_MESSAGE,
} from '@turtle-soup/core/jev';
import type { GameMode, GameStatus, Message } from '@turtle-soup/core/types';
import { createSignal, onCleanup } from 'solid-js';
import puzzles from '../data/puzzles.json';
import { loadSettings } from './storage';

export function useGame() {
  const [puzzle, setPuzzle] = createSignal(selectPuzzle(puzzles));
  const [mode, setMode] = createSignal<GameMode>('question');
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [input, setInput] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [status, setStatus] = createSignal<GameStatus>('playing');
  const [settings, setSettings] = createSignal(loadSettings());
  const [error, setError] = createSignal('');
  let active: AbortController | undefined;
  const cancel = () => {
    active?.abort();
    active = undefined;
    setLoading(false);
  };
  onCleanup(cancel);
  const reveal = () => {
    cancel();
    setError('');
    setStatus('revealed');
  };
  const startNewGame = () => {
    cancel();
    setPuzzle(selectPuzzle(puzzles, puzzle().id));
    setMessages([]);
    setMode('question');
    setStatus('playing');
    setInput('');
    setError('');
  };
  const submit = async () => {
    const content = input().trim();
    if (!content || active || status() !== 'playing') return;
    const controller = new AbortController();
    active = controller;
    const submittedMode = mode();
    setLoading(true);
    setError('');
    try {
      const result =
        submittedMode === 'question'
          ? await askQuestion(puzzle(), content, settings(), controller.signal)
          : await evaluateSolution(
              puzzle(),
              content,
              settings(),
              controller.signal
            );
      if (active !== controller) return;
      const reply =
        'answer' in result
          ? questionLabels[result.answer]
          : solutionLabels[result.status];
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: 'user', mode: submittedMode, content },
        { id: crypto.randomUUID(), role: 'host', content: reply },
      ]);
      setInput('');
      if ('status' in result && result.status === 'correct')
        setStatus('solved');
    } catch (cause) {
      if (active === controller)
        setError(cause instanceof Error ? cause.message : JEV_ERROR_MESSAGE);
    } finally {
      if (active === controller) {
        active = undefined;
        setLoading(false);
      }
    }
  };
  return {
    puzzle,
    mode,
    setMode,
    messages,
    input,
    setInput,
    loading,
    status,
    settings,
    setSettings,
    error,
    reveal,
    startNewGame,
    submit,
  };
}
