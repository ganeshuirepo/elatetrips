# Public API handoff from foundation owner031

This is the owner's public interface handoff (not permission to inspect foundation implementation). Source checkpoint440542e97a7e0a4f0b63a477bef115760e8f7b5b. Import from ../foundation/policy-snapshot. Type/compiler diagnostic use allowed; no manual foundation source or earlier spec reads.

```ts
import { openPolicySnapshotStore, type PolicySnapshotOptions, type PolicySnapshotCommand, type PolicySnapshotStore, type PolicySnapshotResult } from '../foundation/policy-snapshot';
// Also exported: snapshotPolicySchema (strictZod canonicalcore), PolicySnapshot,
// PolicySnapshotEvent, PolicySnapshotConfiguration, PolicyBookingBinding.
interface PolicySnapshotOptions {
 client: mongo.MongoClient; database: string; namespace: string; keys: StorageKeys;
 clock(): string; tokens: ITokenService; accounts: AccountDirectory;
 memberships: MembershipDirectory; loadPermissions(): Promise<unknown>;
 configuration: {adapterId:string; revision:number; readAction:'booking.read';writeAction:'booking.write';transaction:{policyId:string;revision:number;maxRecords:number}};
 resolveBooking(bookingId:string,principal:VerifiedPrincipal):Promise<unknown>;
 validateProducer(snapshot:Readonly<PolicySnapshot>):boolean;
}
interface PolicyBookingBinding {
 bookingId:string;quoteId:string;partnerId:string;tenantId:string;contextId:string;
 scope:{kind:'customer'|'organization'|'partner';id:string};
 eventActor:'customer'|'ops'|'supplier'|'system'|'ai';
 eventRole:'customer'|'dmc'|'hotel'|'provider'|'ops'|'platform';
}
interface PolicySnapshot {
 snapshotId:string;bookingId:string;quoteId:string;partnerId:string;tenantId:string;contextId:string;
 policy: /* exact frozen canonical policy */;
 body?:unknown; // Inferred optional, runtime REQUIRES own key and canonicalJSON.
}
interface PolicySnapshotEvent {
 event_id:string;type:'policy.snapshotted';actor:PolicyBookingBinding['eventActor'];actor_id:string;
 role:PolicyBookingBinding['eventRole'];ts:string;
 subject:{booking_id:string;quote_id?:string;rfq_id?:string};before:null;
 after?:unknown; // Runtime REQUIRES key and canonical equality to snapshot.body.
 payload:{booking_id:string;policy_id:string;version:number};
}
interface PolicySnapshotCommand {commandId:string;correlationId:string;snapshot:PolicySnapshot;event:PolicySnapshotEvent;}
type PolicySnapshotResult=Readonly<{commandId:string;snapshot:Readonly<PolicySnapshot>;event:Readonly<PolicySnapshotEvent>;receipt:Readonly<{revision:number;eventId:string}>}>;
interface PolicySnapshotStore {
 commit(token:string,input:PolicySnapshotCommand):Promise<PolicySnapshotResult>;
 read(token:string,bookingId:string):Promise<PolicySnapshotResult|null>;
}
// async openPolicySnapshotStore(options):Promise<PolicySnapshotStore>
```

All objects strict. IDs trimmed/nonempty/noNUL max128; versions positive safeints, days nonnegative safeints, percentages0..100; canonical currenciesshared enum. configuration.transaction.maxRecords must>=2.

## Minimal local fixture

```ts
import {randomBytes} from 'node:crypto';
import {mongo} from 'mongoose';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
const replica=await MongoMemoryReplSet.create({replSet:{count:1,storageEngine:'wiredTiger'}});
const client=await new mongo.MongoClient(replica.getUri()).connect();
const store=await openPolicySnapshotStore({
 client,database:'fixture_policy',namespace:'fixture_policy',
 keys:{activeKeyId:'fixture-key',encryptionKeys:new Map([['fixture-key',randomBytes(32)]]),fingerprintKey:randomBytes(32)},
 clock:()=> '2026-10-21T12:00:00.000Z',
 tokens:{sign:()=>'',verify:()=>({phone:'fixture-token-identifier'})},
 accounts:{findByTokenIdentifier:async()=>({userId:'fixture-user',active:true})},
 memberships:{listForUser:async(userId)=>[{membershipId:'fixture-membership',userId,scope:{kind:'organization',id:'fixture-organization'},role:'ops',active:true,validFrom:null,expiresAt:null}]},
 loadPermissions:async()=>({policyId:'fixture-permissions',revision:1,grants:[{action:'booking.read',roles:['ops']},{action:'booking.write',roles:['ops']}]}),
 configuration:{adapterId:'fixture-policy-producer',revision:1,readAction:'booking.read',writeAction:'booking.write',transaction:{policyId:'fixture-policy-commit',revision:1,maxRecords:2}},
 resolveBooking, // REQUIRED authoritative scope/binding adapter, not echoed command.
 validateProducer, // REQUIRED pure synchronous completebody/projection/provenance validator.
});
// close client then replica at test cleanup. Random fixture keys only; production keymanagement external.
```

Store calls resolvePrincipal afresh on EVERY commit/replay/read, then authoritative booking binding, current permissions and exact membership scope. Reopening retains same keys/namespace/transactionpolicyid; independent fingerprint key muststaystable, encryptionkeys mayretainrotatedreadkeys. resolveBooking must enforce brand/module/tenant via authoritative server data; identity currently customer/org/partner scope.

validateProducer must validate complete producerbody, acceptance/provenance evidence and exact metadata projection. Unconditionaltrue or acceptsAnyJSON is insufficient. It is called on input AND decryptedresults, mustnot consult latest mutablecatalog. Production acceptance authenticity remains a required trusted adapter, not pure JSON or SHA. Snapshot/body canonical policy, actor IDs and authorization are independentlychecked. event.actor_id===freshaccountID and actor/role===trustedbinding. event.after canonicallyequals body. Domain event subject/payload booking andpolicy/version, optionalquote, and canonical policyquote/partner mustmatch. Fingerprint bindsfullrequest/body/event/config withdurableauthenticatedreceipt.

Results detached/recursivelyfrozen. Receipt.eventId INTERNAL auditID; result.event.event_id canonical DOMAIN ID. No replayboolean: exactretryreturnsidentical originalresult+receipt. read returnsnull onlyafterfreshauth ifnosnapshot. Exceptions FoundationStoreError .code/.message nonsensitive, exported fromfoundation persistence; codes INVALID_REQUEST,INVALID_RECORD,AUTH_SCOPE_DENIED,POLICY_INVALID,IDENTITY_UNAVAILABLE,REVISION_CONFLICT,RECORD_IMMUTABLE,RECORD_MODE_MISMATCH,IDEMPOTENCY_CONFLICT,STORAGE_UNAVAILABLE,INTEGRITY_FAILURE,SCHEMA_VERSION_UNSUPPORTED,RULE_DENIED,BATCH_LIMIT_EXCEEDED,TRANSACTIONS_REQUIRED.

Internalformat policy-snapshot-envelope-v1: snapshotkind='policy-snapshot' after={format:1,request:PolicySnapshotCommand,binding:PolicyBookingBinding,configuration,permissions}; marker kind='policy-snapshot-event'after={format:1,bookingId,eventId,snapshotId,commandId}. TWO internal outbox entries; exactlyONE nested canonicaldomain event at authenticatedsnapshotKind after.request.event. Reference-only marker mustnot bepublished as domain event. No domainpublisher/deliveryadapter wired.
