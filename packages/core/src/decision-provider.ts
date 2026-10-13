import { Effect, Layer, Schema } from 'effect';
import { AiError, DecisionModel } from 'effect/ai';
import { FetchHttpClient } from 'effect/http';
import { DecisionClient, DecisionClientLayer } from './decision-client';
import { type ChoiceAnswer, DecisionRequest } from './decision-schema';
import type { DecisionSettings } from './types';

const aiError = (
  reason: AiError.UnknownError | AiError.UnsupportedSchemaError
) => AiError.make({ module: 'JevDecisionModel', method: 'decide', reason });

export const providerOptionsToRequest = (
  options: DecisionModel.ProviderOptions,
  model = 'jev-latest'
): Effect.Effect<DecisionRequest, AiError.AiError> =>
  Effect.gen(function* () {
    const questions: Record<string, DecisionRequest['questions'][string]> =
      Object.create(null);
    for (const [id, decision] of Object.entries(options.decisions)) {
      if (decision._tag !== 'Classify') {
        return yield* Effect.fail(
          aiError(
            new AiError.UnsupportedSchemaError({
              description: `Unsupported decision type: ${decision._tag}`,
            })
          )
        );
      }

      questions[id] = {
        type: 'choice',
        instructions: decision.instructions,
        criteria: decision.criteria,
      };
    }

    return yield* Schema.decodeUnknownEffect(DecisionRequest)({
      model,
      state: JSON.stringify(options.state),
      questions,
    }).pipe(
      Effect.mapError((cause) =>
        aiError(Object.assign(new AiError.UnknownError({}), { cause }))
      )
    );
  });

export const choiceAnswersToProvider = (
  questions: DecisionRequest['questions'],
  answers: Readonly<Record<string, ChoiceAnswer>>
): DecisionModel.ProviderResponse => ({
  answers: Object.fromEntries(
    Object.entries(answers).map(([id, answer]) => [
      id,
      {
        _tag: 'Classify' as const,
        label: answer.choice,
        probabilities:
          answer.probabilities ??
          Object.fromEntries(
            Object.keys(questions[id]!.criteria).map((label) => [
              label,
              label === answer.choice ? 1 : 0,
            ])
          ),
        ...(answer.confidence === undefined
          ? {}
          : { confidence: answer.confidence }),
      },
    ])
  ),
  usage: { inputTokens: undefined, outputTokens: undefined },
});

const jevDecisionModel = (model = 'jev-latest') =>
  Layer.effect(
    DecisionModel.DecisionModel,
    Effect.gen(function* () {
      const client = yield* DecisionClient;

      return yield* DecisionModel.make({
        decide: (options) =>
          providerOptionsToRequest(options, model).pipe(
            Effect.flatMap((payload) =>
              client.request(payload).pipe(
                Effect.map((answers) =>
                  choiceAnswersToProvider(payload.questions, answers)
                ),
                Effect.mapError((cause) =>
                  aiError(
                    Object.assign(new AiError.UnknownError({}), { cause })
                  )
                )
              )
            )
          ),
      });
    })
  );

export const JevDecisionModel = jevDecisionModel();

export const JevDecisionModelLayer = (settings: DecisionSettings) =>
  jevDecisionModel(settings.apiModel?.trim()).pipe(
    Layer.provide(DecisionClientLayer(settings))
  );

export const JevDecisionModelLive = (settings: DecisionSettings) =>
  JevDecisionModelLayer(settings).pipe(Layer.provide(FetchHttpClient.layer));
