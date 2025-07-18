import { colors as c } from "../lib/color.js";
import { qsend } from "../lib/helpers.js";
import * as jobs from "../lib/jobs.js";
import { 
  libObjc, 
  ObjC 
} from "./lib/libobjc.js";
import type { default as ObjCTypes } from "frida-objc-bridge";

// These hooks attempt many ways to kill SSL pinning and certificate
// validations. The first sections search for common libraries and
// class methods used in many examples online to demonstrate how
// to pin SSL certificates.

// As far as libraries and classes go, this hook searches for:
//
//  - AFNetworking.
//      AFNetworking has a very easy pinning feature that can be disabled
//      by setting the 'PinningMode' to 'None'.
//
//  - NSURLSession.
//      NSURLSession makes use of a delegate method with the signature
//      'URLSession:didReceiveChallenge:completionHandler:' that allows
//      developers to extract the server presented certificate and make
//      decisions to complete the request or cancel it. The hook for this
//      Class searches for the selector and replaces it one that will
//      continue regardless of the logic in this method, and apply the
//      original block as a callback, with a successful return.
//
//  - NSURLConnection.
//      While an old method, works similar to NSURLSession, except there is
//      no completionHandler block, so just the successful challenge is returned.

// The more 'lower level' stuff is basically a reimplementation of the commonly
// known 'SSL-Killswitch2'[1], which hooks and replaces lower level certificate validation
// methods with ones that will always pass. An important note should be made on the
// implementation changes from iOS9 to iOS10 as detailed here[2]. This hook also tries
// to implement those for iOS10.
//  [1] https://github.com/nabla-c0d3/ssl-kill-switch2/blob/master/SSLKillSwitch/SSLKillSwitch.m
//  [2] https://nabla-c0d3.github.io/blog/2017/02/05/ios10-ssl-kill-switch/

// Many apps implement the SSL pinning in interesting ways, if this hook fails, all
// is not lost yet. Sometimes, there is a method that just checks some configuration
// item somewhere, and returns a BOOL, indicating whether pinning is applicable or
// not. So, hunt that method and hook it :)


// a simple flag to control if we should be quiet or not
let quiet: boolean = false;

const afNetworking = (ident: number): InvocationListener[] => {
  const { AFHTTPSessionManager, AFSecurityPolicy } = ObjC.classes;

  // If AFNetworking is not a thing, just move on.
  if (!(AFHTTPSessionManager && AFSecurityPolicy)) {
    return [];
  }

  send(c.blackBright(`[${ident}] `) + `Found AFNetworking library. Hooking known pinning methods.`);

  // -[AFSecurityPolicy setSSLPinningMode:]
  const setSSLPinningmode: InvocationListener = Interceptor.attach(
    AFSecurityPolicy["- setSSLPinningMode:"].implementation, {
    onEnter(args) {
      // typedef NS_ENUM(NSUInteger, AFSSLPinningMode) {
      //     AFSSLPinningModeNone,
      //     AFSSLPinningModePublicKey,
      //     AFSSLPinningModeCertificate,
      // };
      qsend(quiet,
        c.blackBright(`[${ident}] `) + `[AFNetworking] Called ` +
        c.green(`-[AFSecurityPolicy setSSLPinningMode:]`) + ` with mode ` +
        c.red(args[2].toString()),
      );

      if (!args[2].isNull()) {
        qsend(quiet,
          c.blackBright(`[${ident}] `) + `[AFNetworking] ` +
          c.blueBright(`Altered `) +
          c.green(`-[AFSecurityPolicy setSSLPinningMode:]`) + ` mode to ` +
          c.green(`0x0`),
        );

        // update mode to 0 (AFSSLPinningModeNone), bypassing it.
        args[2] = new NativePointer(0x0);
      }
    },
  });

  // -[AFSecurityPolicy setAllowInvalidCertificates:]
  const setAllowInvalidCertificates: InvocationListener = Interceptor.attach(
    AFSecurityPolicy["- setAllowInvalidCertificates:"].implementation, {
    onEnter(args) {
      qsend(quiet,
        c.blackBright(`[${ident}] `) + `[AFNetworking] Called ` +
        c.green(`-[AFSecurityPolicy setAllowInvalidCertificates:]`) + ` with allow ` +
        c.red(args[2].toString()),
      );

      if (args[2].equals(new NativePointer(0x0))) {
        qsend(quiet,
          c.blackBright(`[${ident}] `) + `[AFNetworking] ` +
          c.blueBright(`Altered `) +
          c.green(`-[AFSecurityPolicy setAllowInvalidCertificates:]`) + ` allow to ` +
          c.green(`0x1`),
        );

        // Basically, do [policy setAllowInvalidCertificates:YES];
        args[2] = new NativePointer(0x1);
      }
    },
  });

  // +[AFSecurityPolicy policyWithPinningMode:]
  const policyWithPinningMode: InvocationListener = Interceptor.attach(
    AFSecurityPolicy["+ policyWithPinningMode:"].implementation, {
    onEnter(args) {
      // typedef NS_ENUM(NSUInteger, AFSSLPinningMode) {
      //     AFSSLPinningModeNone,
      //     AFSSLPinningModePublicKey,
      //     AFSSLPinningModeCertificate,
      // };
      qsend(quiet,
        c.blackBright(`[${ident}] `) + `[AFNetworking] Called ` +
        c.green(`+[AFSecurityPolicy policyWithPinningMode:]`) + ` with mode ` +
        c.red(args[2].toString()),
      );

      if (!args[2].isNull()) {
        qsend(quiet,
          c.blackBright(`[${ident}] `) + `[AFNetworking] ` +
          c.blueBright(`Altered `) +
          c.green(`+[AFSecurityPolicy policyWithPinningMode:]`) + ` mode to ` +
          c.green(`0x0`),
        );

        // effectively set to AFSSLPinningModeNone
        args[2] = new NativePointer(0x0);
      }
    },
  });

  // +[AFSecurityPolicy policyWithPinningMode:withPinnedCertificates:]
  const policyWithPinningModewithPinnedCertificates: InvocationListener | null =
    (AFSecurityPolicy["+ policyWithPinningMode:withPinnedCertificates:"]) ? Interceptor.attach(
      AFSecurityPolicy["+ policyWithPinningMode:withPinnedCertificates:"].implementation, {
      onEnter(args) {
        // typedef NS_ENUM(NSUInteger, AFSSLPinningMode) {
        //     AFSSLPinningModeNone,
        //     AFSSLPinningModePublicKey,
        //     AFSSLPinningModeCertificate,
        // };
        qsend(quiet,
          c.blackBright(`[${ident}] `) + `[AFNetworking] Called ` +
          c.green(`+[AFSecurityPolicy policyWithPinningMode:withPinnedCertificates:]`) + ` with mode ` +
          c.red(args[2].toString()),
        );

        if (!args[2].isNull()) {
          qsend(quiet,
            c.blackBright(`[${ident}] `) + `[AFNetworking] ` +
            c.blueBright(`Altered `) +
            c.green(`+[AFSecurityPolicy policyWithPinningMode:withPinnedCertificates:]`) + ` mode to ` +
            c.green(`0x0`),
          );

          // effectively set to AFSSLPinningModeNone
          args[2] = new NativePointer(0x0);
        }
      },
    }) : null;

  return [
    setSSLPinningmode,
    setAllowInvalidCertificates,
    policyWithPinningMode,
    ...(policyWithPinningModewithPinnedCertificates ? [policyWithPinningModewithPinnedCertificates] : []),
  ];
};

const nsUrlSession = (ident: number): InvocationListener[] => {
  const NSURLCredential: ObjCTypes.Object = ObjC.classes.NSURLCredential;
  const resolver = new ApiResolver("objc");
  // - [NSURLSession URLSession:didReceiveChallenge:completionHandler:]
  const search: ApiResolverMatch[] = resolver.enumerateMatches(
    "-[* URLSession:didReceiveChallenge:completionHandler:]");

  // Move along if no NSURLSession usage is found
  if (search.length <= 0) {
    return [];
  }

  send(c.blackBright(`Found NSURLSession based classes. Hooking known pinning methods.`));

  // hook all of the methods that matched the selector
  return search.map((i) => {
    return Interceptor.attach(i.address, {
      onEnter(args) {
        // 0
        // 1
        // 2 URLSession
        // 3 didReceiveChallenge
        // 4 completionHandler
        const receiver = new ObjC.Object(args[0]);
        const selector = ObjC.selectorAsString(args[1]);
        const challenge = new ObjC.Object(args[3]);

        qsend(quiet,
          c.blackBright(`[${ident}] `) + `[AFNetworking] Called ` +
          c.green(`-[${receiver} ${selector}]`) + `, ensuring pinning is passed`,
        );

        // get the original completion handler, and save it
        const completionHandler = new ObjC.Block(args[4]);
        const savedCompletionHandler = completionHandler.implementation;

        // ignore everything the original method wanted to do,
        // and prepare the successful arguments for the original
        // completion handler
        completionHandler.implementation = () => {
          // Example handler source

          // SecTrustRef serverTrust = challenge.protectionSpace.serverTrust;
          // SecCertificateRef certificate = SecTrustGetCertificateAtIndex(serverTrust, 0);
          // NSData *remoteCertificateData = CFBridgingRelease(SecCertificateCopyData(certificate));
          // NSString *cerPath = [[NSBundle mainBundle] pathForResource:@"swapi.co" ofType:@"der"];
          // NSData *localCertData = [NSData dataWithContentsOfFile:cerPath];

          // if ([remoteCertificateData isEqualToData:localCertData]) {

          //     NSURLCredential *credential = [NSURLCredential credentialForTrust:serverTrust];
          //     [[challenge sender] useCredential:credential forAuthenticationChallenge:challenge];
          //     completionHandler(NSURLSessionAuthChallengeUseCredential, credential);

          // } else {

          //     [[challenge sender] cancelAuthenticationChallenge:challenge];
          //     completionHandler(NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
          // }
          const credential = NSURLCredential.credentialForTrust_(challenge.protectionSpace().serverTrust());
          challenge.sender().useCredential_forAuthenticationChallenge_(credential, challenge);

          // typedef NS_ENUM(NSInteger, NSURLSessionAuthChallengeDisposition) {
          //     NSURLSessionAuthChallengeUseCredential = 0,
          //     NSURLSessionAuthChallengePerformDefaultHandling = 1,
          //     NSURLSessionAuthChallengeCancelAuthenticationChallenge = 2,
          //     NSURLSessionAuthChallengeRejectProtectionSpace = 3,
          // } NS_ENUM_AVAILABLE(NSURLSESSION_AVAILABLE, 7_0);
          savedCompletionHandler(0, credential);
        };
      },
    });
  });
};

// TrustKit
const trustKit = (ident: number): InvocationListener | null => {
  // https://github.com/datatheorem/TrustKit/blob/
  //  71878dce8c761fc226fecc5dbb6e86fbedaee05e/TrustKit/TSKPinningValidator.m#L84
  if (!ObjC.classes.TSKPinningValidator) {
    return null;
  }

  send(c.blackBright(`[${ident}] `) + `Found TrustKit. Hooking known pinning methods.`);

  return Interceptor.attach(ObjC.classes.TSKPinningValidator["- evaluateTrust:forHostname:"].implementation, {
    onLeave(retval) {
      qsend(quiet,
        c.blackBright(`[${ident}] `) + `[TrustKit] Called ` +
        c.green(`-[TSKPinningValidator evaluateTrust:forHostname:]`) + ` with result ` +
        c.red(retval.toString()),
      );

      if (!retval.isNull()) {
        qsend(quiet,
          c.blackBright(`[${ident}] `) + `[TrustKit] ` +
          c.blueBright(`Altered `) +
          c.green(`-[TSKPinningValidator evaluateTrust:forHostname:]`) + ` mode to ` +
          c.green(`0x0`),
        );

        retval.replace(new NativePointer(0x0));
      }
    },
  });
};

const cordovaCustomURLConnectionDelegate = (ident: number): InvocationListener | null => {
  // https://github.com/EddyVerbruggen/SSLCertificateChecker-PhoneGap-Plugin/blob/
  //  67634bfdf4a31bb09b301db40f8f27fbd8818f61/src/ios/SSLCertificateChecker.m#L109-L116
  if (!ObjC.classes.CustomURLConnectionDelegate) {
    return null;
  }

  send(c.blackBright(`[${ident}] `) + `Found SSLCertificateChecker-PhoneGap-Plugin.` +
    ` Hooking known pinning methods.`);

  return Interceptor.attach(ObjC.classes.CustomURLConnectionDelegate["- isFingerprintTrusted:"].implementation, {
    onLeave(retval) {
      qsend(quiet,
        c.blackBright(`[${ident}] `) + `[SSLCertificateChecker-PhoneGap-Plugin] Called ` +
        c.green(`-[CustomURLConnectionDelegate isFingerprintTrusted:]`) + ` with result ` +
        c.red(retval.toString()),
      );

      if (retval.isNull()) {
        qsend(quiet,
          c.blackBright(`[${ident}] `) + `[SSLCertificateChecker-PhoneGap-Plugin] ` +
          c.blueBright(`Altered `) +
          c.green(`-[CustomURLConnectionDelegate isFingerprintTrusted:]`) + ` mode to ` +
          c.green(`0x1`),
        );

        retval.replace(new NativePointer(0x1));
      }
    },
  });
};

const sSLSetSessionOption = (ident: number): NativePointerValue => {
  const kSSLSessionOptionBreakOnServerAuth = 0;
  const noErr = 0;
  const SSLSetSessionOption = libObjc.SSLSetSessionOption;

  Interceptor.replace(SSLSetSessionOption, new NativeCallback((context, option, value) => {
    // Remove the ability to modify the value of the kSSLSessionOptionBreakOnServerAuth option
    //  ^ from SSL-Kill-Switch2 sources
    // https://github.com/nabla-c0d3/ssl-kill-switch2/blob/
    //  f7e73a2044340d59f2b96d972afcbc3c2f50ab27/SSLKillSwitch/SSLKillSwitch.m#L70
    if (option === kSSLSessionOptionBreakOnServerAuth) {
      qsend(quiet,
        c.blackBright(`[${ident}] `) + `Called ` +
        c.green(`SSLSetSessionOption()`) +
        `, removing ability to modify kSSLSessionOptionBreakOnServerAuth.`,
      );
      return noErr;
    }

    return SSLSetSessionOption(context, option, value);
  }, "int", ["pointer", "int", "bool"]));

  return SSLSetSessionOption;
};

const sSLCreateContext = (ident: number): NativePointerValue => {
  const kSSLSessionOptionBreakOnServerAuth = 0;
  const SSLSetSessionOption = libObjc.SSLSetSessionOption;
  const SSLCreateContext = libObjc.SSLCreateContext;

  Interceptor.replace(SSLCreateContext, new NativeCallback((alloc, protocolSide, connectionType) => {
    // Immediately set the kSSLSessionOptionBreakOnServerAuth option in order to disable cert validation
    //  ^ from SSL-Kill-Switch2 sources
    //  https://github.com/nabla-c0d3/ssl-kill-switch2/blob/
    //    f7e73a2044340d59f2b96d972afcbc3c2f50ab27/SSLKillSwitch/SSLKillSwitch.m#L89
    const sslContext = SSLCreateContext(alloc, protocolSide, connectionType);
    SSLSetSessionOption(sslContext, kSSLSessionOptionBreakOnServerAuth, 1);

    qsend(quiet,
      c.blackBright(`[${ident}] `) + `Called ` +
      c.green(`SSLCreateContext()`) +
      `, setting kSSLSessionOptionBreakOnServerAuth to disable cert validation.`,
    );

    return sslContext;
  }, "pointer", ["pointer", "int", "int"]));

  return SSLCreateContext;
};

const sSLHandshake = (ident: number): NativePointerValue => {
  const errSSLServerAuthCompared = -9481;
  const SSLHandshake = libObjc.SSLHandshake;

  Interceptor.replace(SSLHandshake, new NativeCallback((context) => {
    const result = SSLHandshake(context);

    if (result === errSSLServerAuthCompared) {
      qsend(quiet,
        c.blackBright(`[${ident}] `) + `Called ` +
        c.green(`SSLHandshake()`) +
        `, calling again to skip certificate validation.`,
      );

      return SSLHandshake(context);
    }
    return result;
  }, "int", ["pointer"]));

  return SSLHandshake;
};

// tls_helper_create_peer_trust
const tlsHelperCreatePeerTrust = (ident: number): NativePointerValue => {
  const noErr = 0;
  const tlsHelper = libObjc.tls_helper_create_peer_trust;

  if (tlsHelper.isNull()) {
    return NULL;
  }

  Interceptor.replace(tlsHelper, new NativeCallback((hdsk, server, SecTrustRef) => {
    qsend(quiet,
      c.blackBright(`[${ident}] `) + `Called ` +
      c.green(`tls_helper_create_peer_trust()`) +
      `, returning noErr.`,
    );

    return noErr;
  }, "int", ["pointer", "bool", "pointer"]));

  return tlsHelper;
};

// nw_tls_create_peer_trust
const nwTlsCreatePeerTrust = (ident: number): InvocationListener | null => {
  const peerTrust = libObjc.nw_tls_create_peer_trust;

  if (peerTrust.isNull()) {
    return null;
  }

  return Interceptor.attach(peerTrust, {
    onEnter: () => {
      qsend(quiet,
        c.blackBright(`[${ident}] `) + `Called ` +
        c.green(`nw_tls_create_peer_trust()`) +
        `, ` +
        c.red(`no working bypass implemented yet.`),
      );
    },
  });

  // TODO: nw_tls_create_peer_trust() always returns 0, but also seems to have
  // some internal logic that makes a simple replacement not work.
  //
  // const noErr = 0;
  // Interceptor.replace(peerTrust, new NativeCallback((hdsk, server, SecTrustRef) => {
  //   send(
  //     c.blackBright(`[${ident}] `) + `Called ` +
  //     c.green(`nw_tls_create_peer_trust()`) +
  //     `, returning noErr.`,
  //   );

  //   return noErr;
  // }, "int", ["pointer", "bool", "pointer"]));

  // return peerTrust;
};

// SSL_CTX_set_custom_verify
const sSLCtxSetCustomVerify = (ident: number): NativePointerValue[] => {
  const getPskIdentity = libObjc.SSL_get_psk_identity;
  let setCustomVerify = libObjc.SSL_set_custom_verify;
  if (setCustomVerify.isNull()) {
    send(c.blackBright(`SSL_set_custom_verify not found, trying SSL_CTX_set_custom_verify`));
    setCustomVerify = libObjc.SSL_CTX_set_custom_verify;
  }

  if (setCustomVerify.isNull() || getPskIdentity.isNull()) {
    return [];
  }

  // tslint:disable-next-line:only-arrow-functions variable-name
  const customVerifyCallback = new NativeCallback(function (ssl, out_alert) {
    qsend(quiet,
      c.blackBright(`[${ident}] `) + `Called ` +
      c.green(`custom SSL context verify callback`) +
      `, returning SSL_VERIFY_NONE.`,
    );
    return 0;
  }, "int", ["pointer", "pointer"]);

  // tslint:disable-next-line:only-arrow-functions
  Interceptor.replace(setCustomVerify, new NativeCallback(function (ssl, mode, callback) {
    qsend(quiet,
      c.blackBright(`[${ident}] `) + `Called ` +
      c.green(`SSL_CTX_set_custom_verify()`) +
      `, setting custom callback.`,
    );
    setCustomVerify(ssl, mode, customVerifyCallback);
  }, "void", ["pointer", "int", "pointer"]));

  // tslint:disable-next-line:only-arrow-functions
  Interceptor.replace(getPskIdentity, new NativeCallback(function (ssl) {
    qsend(quiet,
      c.blackBright(`[${ident}] `) + `Called ` +
      c.green(`SSL_get_psk_identity()`) +
      `, returning "fakePSKidentity".`,
    );
    return Memory.allocUtf8String("fakePSKidentity");
  }, "pointer", ["pointer"]));

  return [
    setCustomVerify,
    getPskIdentity,
  ];
};

// exposed method to setup all of the interceptor invocations and replacements
export const disable = (q: boolean): void => {

  if (q) {
    send(`Quiet mode enabled. Not reporting invocations.`);
    quiet = true;
  }

  const job: jobs.Job = new jobs.Job(jobs.identifier(), "ios-sslpinning-disable");

  // Framework hooks.
  send(c.blackBright(`Hooking common framework methods`));

  afNetworking(job.identifier).forEach((i) => {
    job.addInvocation(i);
  });
  nsUrlSession(job.identifier).forEach((i) => {
    job.addInvocation(i);
  });
  job.addInvocation(trustKit(job.identifier));
  job.addInvocation(cordovaCustomURLConnectionDelegate(job.identifier));

  // Low level hooks.

  // iOS 9<
  send(c.blackBright(`Hooking lower level SSL methods`));
  job.addReplacement(sSLSetSessionOption(job.identifier));
  job.addReplacement(sSLCreateContext(job.identifier));
  job.addReplacement(sSLHandshake(job.identifier));

  // iOS 10>
  send(c.blackBright(`Hooking lower level TLS methods`));
  job.addReplacement(tlsHelperCreatePeerTrust(job.identifier));
  job.addInvocation(nwTlsCreatePeerTrust(job.identifier));

  // iOS 11>
  send(c.blackBright(`Hooking BoringSSL methods`));
  // sSLCtxSetCustomVerify(job.identifier)
  sSLCtxSetCustomVerify(job.identifier).forEach((i) => {
    job.addReplacement(i);
  });

  jobs.add(job);
};
