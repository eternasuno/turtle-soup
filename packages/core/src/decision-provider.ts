import { TypeSafeClient, TypeSafeDecisionModel } from '@effect/ai-typesafe';
import { Effect, Layer, Option, Schema, Scope } from 'effect';
import { AiError, DecisionModel } from 'effect/ai';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { type ChoiceAnswer, DecisionRequest } from './decision-schema';
import { resolveDecisionConfiguration, SettingsError } from './settings';
import type { DecisionSettings } from './types';

const aiError = (
  reason: AiError.UnknownError | AiError.UnsupportedSchemaError
) => AiError.make({ module: 'DecisionModel', method: 'decide', reason });

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

const timeoutFailure = (cause: unknown) =>
  Effect.fail(aiError(Object.assign(new AiError.UnknownError({}), { cause })));

const requestPolicyLayer = Layer.effect(
  DecisionModel.DecisionModel,
  Effect.gen(function* () {
    const model = yield* DecisionModel.DecisionModel;

    const configured: DecisionModel.DecisionModel = {
      ...model,
      decide: (definition, options) =>
        model.decide(definition, options).pipe(
          Effect.scoped,
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
          Effect.provideService(FetchHttpClient.RequestInit, {
            credentials: 'omit',
            redirect: 'error',
          }),
          Effect.timeout(30_000),
          Effect.catchTag('TimeoutError', timeoutFailure)
        ),
    };

    return configured;
  })
);

export const DecisionModelLayer = (settings: DecisionSettings) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const valid = yield* resolveDecisionConfiguration(settings);
      if (valid.provider !== 'api') {
        return yield* Effect.fail(
          new SettingsError({ message: 'API 客户端需要 API 配置。' })
        );
      }

      const httpClient = yield* HttpClient.HttpClient;
      const scopedClient = HttpClient.makeWith(
        (request) =>
          Effect.flatMap(Effect.serviceOption(Scope.Scope), (scope) =>
            HttpClient.withScope(httpClient)
              .postprocess(request)
              .pipe(
                Effect.provideService(Scope.Scope, Option.getOrThrow(scope))
              )
          ),
        httpClient.preprocess
      );
      const clientLayer = TypeSafeClient.layer({
        apiKey: valid.key,
        transformClient: HttpClient.mapRequest(
          HttpClientRequest.setUrl(valid.url)
        ),
      });
      const modelLayer = TypeSafeDecisionModel.layer({
        model: valid.model,
      }).pipe(
        Layer.provide(clientLayer),
        Layer.provide(Layer.succeed(HttpClient.HttpClient, scopedClient))
      );

      return requestPolicyLayer.pipe(Layer.provide(modelLayer));
    })
  );

export const DecisionModelLive = (settings: DecisionSettings) =>
  DecisionModelLayer(settings).pipe(Layer.provide(FetchHttpClient.layer));
