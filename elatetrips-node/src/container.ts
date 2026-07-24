import type { RequestHandler } from 'express';
import { env } from './config/env';

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

import { ReviewRepository } from './modules/reviews/review.repository';
import { ReviewService } from './modules/reviews/review.service';
import { ReviewController } from './modules/reviews/review.controller';

import { buildAuthGuard } from './common/middleware/authGuard';
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

/**
 * Composition root — the ONLY place that knows concrete classes. Everything else
 * depends on interfaces, so swapping an implementation (e.g. a Redis OTP store)
 * means changing one line here. This is the Dependency Inversion Principle made
 * explicit, without a heavyweight DI framework.
 */
export interface Container {
  authGuard: RequestHandler;
  adminGuard: RequestHandler;
  controllers: {
    catalog: CatalogController;
    auth: AuthController;
    users: UserController;
    orders: OrderController;
    pricing: PricingController;
    partners: PartnerController;
    weddings: WeddingController;
    reviews: ReviewController;
    admin: AdminController;
    console: ConsoleController;
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
  const authService = new AuthService(otpStore, otpSender, tokenService, passwordHasher, usersRepo, env.authAutoActivate);
  const pricingService = new PricingService(vehiclesRepo, destinationsRepo);
  const partnerService = new PartnerService(partnersRepo);
  const weddingService = new WeddingService(weddingsRepo);
  const reviewService = new ReviewService(reviewsRepo, ordersRepo, usersRepo, hotelsRepo);
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

  return {
    authGuard: buildAuthGuard(tokenService),
    adminGuard: buildAdminGuard(env.adminKey),
    controllers: {
      catalog: new CatalogController(catalogService),
      auth: new AuthController(authService),
      users: new UserController(userService),
      orders: new OrderController(orderService),
      pricing: new PricingController(pricingService),
      partners: new PartnerController(partnerService),
      weddings: new WeddingController(weddingService),
      reviews: new ReviewController(reviewService),
      admin: new AdminController(adminService),
      console: new ConsoleController(consoleService),
    },
  };
}
