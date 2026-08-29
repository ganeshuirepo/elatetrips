import type { RequestHandler } from 'express';
import { env } from './config/env';
import { logger } from './common/logger';

import type { ExperienceFacet, PackageOption } from './modules/catalog/catalog.types';
import { MongoReadRepository } from './repositories/MongoReadRepository';
import {
  DestinationModel,
  VehicleModel,
  RoomModel,
  HotelModel,
  OptionModel,
  CelebrationModel,
  ExperienceFacetModel,
  PackageOptionModel,
  PackageModel,
  CelebrationBundleModel,
  ActivityModel,
  ProductModel,
  ShopCatalogModel,
} from './modules/catalog/catalog.models';
import { HotelRepository } from './modules/catalog/hotel.repository';
import { CatalogService } from './modules/catalog/catalog.service';
import { CatalogController } from './modules/catalog/catalog.controller';
import type { CelebrationBundle } from './modules/catalog/catalog.types';

import { UserRepository } from './modules/users/user.repository';
import { UserService } from './modules/users/user.service';
import { UserController } from './modules/users/user.controller';

import { OrderRepository } from './modules/orders/order.repository';
import { OrderService } from './modules/orders/order.service';
import { OrderController } from './modules/orders/order.controller';

import { JwtTokenService } from './modules/auth/token.service';
import { InMemoryOtpStore } from './modules/auth/otp.store';
import { buildOtpSender } from './modules/auth/otp.sender';
import { BcryptPasswordHasher } from './modules/auth/password.service';
import { AuthService } from './modules/auth/auth.service';
import { AuthController } from './modules/auth/auth.controller';

import { PricingService } from './modules/pricing/pricing.service';
import { PricingController } from './modules/pricing/pricing.controller';

import { PartnerRepository } from './modules/partner/partner.repository';
import { PartnerService } from './modules/partner/partner.service';
import { PartnerController } from './modules/partner/partner.controller';

import { WeddingRepository } from './modules/wedding/wedding.repository';
import { WeddingService } from './modules/wedding/wedding.service';
import { WeddingController } from './modules/wedding/wedding.controller';

import { SupportService } from './modules/support/support.service';
import { SupportController } from './modules/support/support.controller';

import { ReviewRepository } from './modules/reviews/review.repository';
import { ReviewService } from './modules/reviews/review.service';
import { ReviewController } from './modules/reviews/review.controller';
import { ExperiencesController } from './modules/experiences/experiences.controller';
import { ExperiencesService } from './modules/experiences/experiences.service';

import { buildAuthGuard } from './common/middleware/authGuard';
import { buildIdentityGuard } from './common/middleware/identityGuard';
import { RefreshService } from './modules/auth/refresh.service';
import { PushService } from './modules/push/push.service';
import { ConsolePushSender } from './modules/push/push.sender';
import { DiskPhotoStorage, type IPhotoStorage } from './modules/uploads/upload.storage';
import { buildAdminGuard } from './modules/admin/console.guard';
import { MongoCrudRepository } from './repositories/MongoCrudRepository';
import { MongoReadRepository as OrdersReadRepository } from './repositories/MongoReadRepository';
import { OrderModel } from './modules/orders/order.model';
import { AdminService } from './modules/admin/admin.service';
import { AdminController } from './modules/admin/admin.controller';
import { ConsoleUserModel, type ConsoleUser } from './modules/admin/console.model';
import { ConsoleService } from './modules/admin/console.service';
import { ConsoleController } from './modules/admin/console.controller';
import type { Activity, Hotel, Vehicle } from './modules/catalog/catalog.types';
import { ContractsEngine } from './modules/contracts/contracts.engine';
import { ContractsController } from './modules/contracts/contracts.controller';

// BRD v1.16 backend engines (M3/M4/M5/M12/M13/M17) — additive, config-driven.
import { SupplierRepository } from './modules/supplier/supplier.repository';
import { SupplierService } from './modules/supplier/supplier.service';
import { SupplierController } from './modules/supplier/supplier.controller';
import { SupplierAuditStore } from './modules/supplier/supplier.audit';
import { loadSupplierConfig } from './modules/supplier/supplier.config';
import { loadCommsConfig } from './modules/comms/comms.config';
import { InMemoryCommsAuditSink } from './modules/comms/comms.audit';
import { buildChannelProvider } from './modules/comms/comms.factory';
import { ConfigRecipientDirectory } from './modules/comms/comms.recipients';
import { CommsService } from './modules/comms/comms.service';
import { CommsController } from './modules/comms/comms.controller';
import { describeRfqFlow, loadRfqFlowConfig } from './modules/rfqflow/rfqflow.config';
import { RfqFlowService } from './modules/rfqflow/rfqflow.service';
import { InMemoryRateRowRepository } from './modules/ratecard/ratecard.repository';
import { ManualUploadSheetProvider } from './modules/ratecard/ratecard.sheets';
import { RatecardAuditStore } from './modules/ratecard/ratecard.audit';
import { loadRatecardConfig } from './modules/ratecard/ratecard.config';
import { RateCardService } from './modules/ratecard/ratecard.service';
import { RateCardController } from './modules/ratecard/ratecard.controller';
import { BroadcastService } from './modules/broadcast/broadcast.service';
import { BroadcastController } from './modules/broadcast/broadcast.controller';
import { StubComms, StubSupplierDirectory } from './modules/broadcast/broadcast.ports';
import { ClassifierService } from './modules/classifier/classifier.service';
import { ClassifierController } from './modules/classifier/classifier.controller';
import { loadNegotiationConfig } from './modules/negotiation/negotiation.config';
import { NegotiationAuditStore } from './modules/negotiation/negotiation.audit';
import { RuleSetStore } from './modules/negotiation/negotiation.store';
import { NegotiationService } from './modules/negotiation/negotiation.service';
import { NegotiationController } from './modules/negotiation/negotiation.controller';

/**
 * Composition root — the ONLY place that knows concrete classes. Everything else
 * depends on interfaces, so swapping an implementation (e.g. a Redis OTP store)
 * means changing one line here. This is the Dependency Inversion Principle made
 * explicit, without a heavyweight DI framework.
 */
export interface Container {
  authGuard: RequestHandler;
  adminGuard: RequestHandler;
  /** User JWT OR console token — uploads and push registration. */
  identityGuard: RequestHandler;
  push: PushService;
  photoStorage: IPhotoStorage;
  controllers: {
    catalog: CatalogController;
    auth: AuthController;
    users: UserController;
    orders: OrderController;
    pricing: PricingController;
    partners: PartnerController;
    weddings: WeddingController;
    reviews: ReviewController;
    experiences: ExperiencesController;
    support: SupportController;
    admin: AdminController;
    console: ConsoleController;
    /** contracts-v1.1 API host (spec 006) — additive, in-memory, fixture-seeded. */
    contracts: ContractsController;
    /** BRD v1.16 backend engines (M3/M4/M5/M12/M13/M17). */
    suppliers: SupplierController;
    comms: CommsController;
    ratecard: RateCardController;
    broadcast: BroadcastController;
    classifier: ClassifierController;
    negotiation: NegotiationController;
  };
}

/**
 * Wiring runs bottom-up, so every dependency exists before whatever consumes it:
 *   1. Repositories (data layer) wrap Mongoose models behind the read/write
 *      interfaces — the generic MongoReadRepository for plain catalog lookups,
 *      bespoke repositories (HotelRepository, OrderRepository, …) where a module
 *      needs custom queries.
 *   2. Cross-cutting auth primitives (token / OTP / password) shared by several
 *      services.
 *   3. Services (use cases) receive their repositories + primitives by
 *      constructor injection — they never `new` a dependency themselves, which is
 *      what keeps them testable and swappable.
 *   4. Controllers receive their service and are handed back in `controllers`,
 *      alongside the pre-built guards. buildApiRouter (routes/index.ts) mounts
 *      each controller under /api/v1 and applies the guards where routes need auth.
 */
export function createContainer(): Container {
  // Repositories (data layer)
  const destinationsRepo = new MongoReadRepository<any>(DestinationModel);
  const vehiclesRepo = new MongoReadRepository<any>(VehicleModel);
  const roomsRepo = new MongoReadRepository<any>(RoomModel);
  const optionsRepo = new MongoReadRepository<any>(OptionModel);
  const celebrationsRepo = new MongoReadRepository<any>(CelebrationModel);
  const experienceFacetsRepo = new MongoReadRepository<ExperienceFacet>(ExperienceFacetModel);
  const packageOptionsRepo = new MongoReadRepository<PackageOption>(PackageOptionModel);
  const packagesRepo = new MongoReadRepository<any>(PackageModel);
  const bundlesRepo = new MongoReadRepository<CelebrationBundle>(CelebrationBundleModel);
  const activitiesRepo = new MongoReadRepository<any>(ActivityModel);
  const productsRepo = new MongoReadRepository<any>(ProductModel);
  const shopCatalogsRepo = new MongoReadRepository<any>(ShopCatalogModel);
  const hotelsRepo = new HotelRepository();
  const usersRepo = new UserRepository();
  const ordersRepo = new OrderRepository();
  const partnersRepo = new PartnerRepository();
  const weddingsRepo = new WeddingRepository();
  const reviewsRepo = new ReviewRepository();

  // Cross-cutting auth primitives
  const tokenService = new JwtTokenService();
  const otpStore = new InMemoryOtpStore();
  const otpSender = buildOtpSender();
  const passwordHasher = new BcryptPasswordHasher();

  // Services (use cases)
  const catalogService = new CatalogService({
    destinations: destinationsRepo,
    vehicles: vehiclesRepo,
    rooms: roomsRepo,
    hotels: hotelsRepo,
    options: optionsRepo,
    celebrations: celebrationsRepo,
    experienceFacets: experienceFacetsRepo,
    packageOptions: packageOptionsRepo,
    packages: packagesRepo,
    bundles: bundlesRepo,
    activities: activitiesRepo,
    products: productsRepo,
    shopCatalogs: shopCatalogsRepo,
  });
  const userService = new UserService(usersRepo);
  const orderService = new OrderService(ordersRepo);
  // Rotating refresh tokens — additive beside the access JWT; TTL is env-driven.
  const refreshService = new RefreshService(env.refreshExpiresDays);
  const authService = new AuthService(otpStore, otpSender, tokenService, passwordHasher, usersRepo, env.authAutoActivate, refreshService);
  // Push delivery (mobile gap #2): tokens per identity + the supportBus hook.
  // Console sender until a Firebase service account exists.
  const pushService = new PushService(ordersRepo, new ConsolePushSender());
  pushService.attach();
  // Photo uploads (mobile gap #1): disk mock-first, S3/Cloudinary later.
  const photoStorage = new DiskPhotoStorage(env.uploadsDir, `${env.publicBaseUrl}/uploads`);
  const pricingService = new PricingService(vehiclesRepo, destinationsRepo);
  const partnerService = new PartnerService(partnersRepo);
  const weddingService = new WeddingService(weddingsRepo);
  const reviewService = new ReviewService(reviewsRepo, ordersRepo, usersRepo, hotelsRepo);
  // Post-booking support: reads orders through the same repository the orders
  // module uses, so a booking and its support thread can never disagree.
  const supportService = new SupportService(ordersRepo);
  // Admin console: write-capable repos over the same mocked catalog collections.
  const hotelsCrud = new MongoCrudRepository<Hotel>(HotelModel);
  const bundlesCrud = new MongoCrudRepository<CelebrationBundle>(CelebrationBundleModel);
  const vehiclesCrud = new MongoCrudRepository<Vehicle>(VehicleModel);
  const activitiesCrud = new MongoCrudRepository<Activity>(ActivityModel);
  const ordersRead = new OrdersReadRepository<Record<string, unknown>>(OrderModel);
  const adminService = new AdminService({
    hotels: hotelsCrud,
    bundles: bundlesCrud,
    vehicles: vehiclesCrud,
    activities: activitiesCrud,
    orders: ordersRead,
  });
  const consoleService = new ConsoleService(
    {
      users: new MongoCrudRepository<ConsoleUser>(ConsoleUserModel),
      hotels: hotelsCrud,
      bundles: bundlesCrud,
      vehicles: vehiclesCrud,
      activities: activitiesCrud,
      orders: ordersRead,
    },
    passwordHasher,
  );
  // contracts-v1.1 host (spec 006): a self-contained, fixture-seeded engine that
  // reads all business values from config (BR-17). Additive — it wraps no
  // existing Mongoose model, so every current route keeps working.
  const contractsEngine = new ContractsEngine();

  // BRD v1.16 engines (M3/M4/M5/M12/M13/M17) — additive, config-driven (BR-17);
  // providers/ports behind interfaces (stubs until real adapters/creds land).
  const supplierService = new SupplierService(
    new SupplierRepository(),
    loadSupplierConfig(),
    new SupplierAuditStore(),
  );
  const commsService = new CommsService({
    // Real SMTP when the mailbox is configured, the logging stub otherwise —
    // the choice is made once, here, and nothing downstream can tell.
    provider: buildChannelProvider().provider,
    sink: new InMemoryCommsAuditSink(),
    config: loadCommsConfig(),
  });
  const ratecardService = new RateCardService({
    repo: new InMemoryRateRowRepository(),
    sheets: new ManualUploadSheetProvider(),
    audit: new RatecardAuditStore(),
    config: loadRatecardConfig(),
  });
  const broadcastService = new BroadcastService({
    directory: new StubSupplierDirectory(),
    comms: new StubComms(),
  });
  // The RFQ dispatcher (customer confirms → partners are mailed → customer is
  // told). Inert unless RFQFLOW_ENABLED is set; see rfqflow.config.ts. Its four
  // ports are adapted here so the service imports none of these modules.
  const rfqFlowConfig = loadRfqFlowConfig();
  logger.info(describeRfqFlow(rfqFlowConfig));
  const rfqFlowService = new RfqFlowService({
    config: rfqFlowConfig,
    candidates: {
      candidatesFor: async (destination, opts) =>
        (await supplierService.findCandidates({ destination, track: opts.track as 'A' | 'B' | undefined })).map((c) => ({
          supplier_id: c.supplier_id,
          name: c.name,
          declared_tat_hours: c.declared_tat_hours,
          comms_consent: c.comms_consent,
          contract_accepted: c.contract_accepted,
          reacceptance_required: c.reacceptance_required,
        })),
    },
    wave: {
      dispatchWave: (rfqId, body) => {
        const { wave_no, links } = contractsEngine.dispatchWave(rfqId, body);
        return { wave_no, links: links.map((l) => ({ supplier_id: l.supplier_id, token: l.token })) };
      },
    },
    mail: { sendTemplated: (input) => commsService.sendTemplated(input) },
    directory: new ConfigRecipientDirectory({
      lookup: { quoteContact: (id) => supplierService.quoteContact(id) },
    }),
    names: { nameFor: async (id) => (await supplierService.getOne(id).catch(() => null))?.name ?? null },
  });

  const classifierService = new ClassifierService();
  const negotiationService = new NegotiationService({
    config: loadNegotiationConfig(),
    store: new RuleSetStore(),
    audit: new NegotiationAuditStore(),
  });

  return {
    authGuard: buildAuthGuard(tokenService),
    adminGuard: buildAdminGuard(env.adminKey),
    identityGuard: buildIdentityGuard(tokenService),
    push: pushService,
    photoStorage,
    controllers: {
      catalog: new CatalogController(catalogService),
      auth: new AuthController(authService),
      users: new UserController(userService),
      orders: new OrderController(orderService),
      pricing: new PricingController(pricingService),
      partners: new PartnerController(partnerService),
      weddings: new WeddingController(weddingService),
      reviews: new ReviewController(reviewService),
      experiences: new ExperiencesController(new ExperiencesService()),
      support: new SupportController(supportService),
      admin: new AdminController(adminService),
      console: new ConsoleController(consoleService),
      contracts: new ContractsController(contractsEngine, rfqFlowService),
      suppliers: new SupplierController(supplierService),
      comms: new CommsController(commsService),
      ratecard: new RateCardController(ratecardService),
      broadcast: new BroadcastController(broadcastService),
      classifier: new ClassifierController(classifierService),
      negotiation: new NegotiationController(negotiationService),
    },
  };
}
