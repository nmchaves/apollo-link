import { ApolloLink, Observable, RequestHandler } from 'apollo-link';
import {
  serializeBody,
  selectURI,
  parseAndCheckResponse,
  checkFetcher,
  selectOptionsAndBody,
  createSignalIfSupported,
  LinkUtils,
} from 'apollo-link-utilities';

export namespace HttpLink {
  export interface UriFunction extends LinkUtils.UriFunction {}
  export interface Options extends LinkUtils.Options {}
}

// For backwards compatibility.
export import FetchOptions = HttpLink.Options;
export import UriFunction = HttpLink.UriFunction;

export const createHttpLink = (linkOptions: HttpLink.Options = {}) => {
  // dev warnings to ensure fetch is present
  checkFetcher(linkOptions.fetch);

  let {
    uri = '/graphql',
    // use default global fetch is nothing passed in
    fetch: fetcher = fetch,
    includeExtensions,
    ...requestOptions
  } = linkOptions;

  const linkConfig = {
    http: { includeExtensions },
    options: requestOptions.fetchOptions,
    credentials: requestOptions.credentials,
    headers: requestOptions.headers,
  };

  return new ApolloLink(operation => {
    const chosenURI = selectURI(operation, uri);

    const context = operation.getContext();

    const contextConfig = {
      http: context.http,
      options: context.fetchOptions,
      credentials: context.credentials,
      headers: context.headers,
    };

    //uses fallback, link, and then context to build options
    const { options, body } = selectOptionsAndBody(
      operation,
      LinkUtils.fallbackConfig,
      linkConfig,
      contextConfig,
    );

    return new Observable(observer => {
      const { controller, signal } = createSignalIfSupported();
      if (controller) (options as any).signal = signal;

      (options as any).body = serializeBody(body);

      fetcher(chosenURI, options)
        .then(response => {
          operation.setContext({ response });
          return response;
        })
        .then(parseAndCheckResponse(operation))
        .then(result => {
          // we have data and can send it to back up the link chain
          observer.next(result);
          observer.complete();
          return result;
        })
        .catch(err => {
          // fetch was cancelled so its already been cleaned up in the unsubscribe
          if (err.name === 'AbortError') return;
          observer.error(err);
        });

      return () => {
        // XXX support canceling this request
        // https://developers.google.com/web/updates/2017/09/abortable-fetch
        if (controller) controller.abort();
      };
    });
  });
};

export class HttpLink extends ApolloLink {
  public requester: RequestHandler;
  constructor(opts?: HttpLink.Options) {
    super(createHttpLink(opts).request);
  }
}
