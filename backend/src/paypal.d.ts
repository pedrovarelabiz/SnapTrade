declare module '@paypal/checkout-server-sdk' {
  export namespace core {
    export class PayPalEnvironment {
      constructor(clientId: string, clientSecret: string);
    }

    export class SandboxEnvironment extends PayPalEnvironment {}
    export class LiveEnvironment extends PayPalEnvironment {}

    export class PayPalHttpClient {
      constructor(environment: PayPalEnvironment);
      execute(request: any): Promise<any>;
    }
  }
}
