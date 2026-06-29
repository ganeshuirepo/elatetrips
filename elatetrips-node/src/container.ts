import type { RequestHandler } from 'express';

import { MongoReadRepository } from './repositories/MongoReadRepository';
import {
  DestinationModel,
  VehicleModel,
  RoomModel,
  OptionModel,
  CelebrationModel,
  PackageModel,
  ActivityModel,
  ProductModel,
  ShopCatalogModel,
} from './modules/catalog/catalog.models';
import { HotelRepository } from './modules/catalog/hotel.repository';
import { CatalogService } from './modules/catalog/catalog.service';
import { CatalogController } from './modules/catalog/catalog.controller';

import { UserRepository } from './modules/users/user.repository';
import { UserService } from './modules/users/user.service';
import { UserController } from './modules/users/user.controller';

import { OrderRepository } from './modules/orders/order.repository';
import { OrderService } from './modules/orders/order.service';
import { OrderController } from './modules/orders/order.controller';

import { JwtTokenService } from './modules/auth/token.service';
import { InMemoryOtpStore } from './modules/auth/otp.store';
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

import { buildAuthGuard } from './common/middleware/authGuard';

/**
 * Composition root — the ONLY place that knows concrete classes. Everything else
 * depends on interfaces, so swapping an implementation (e.g. a Redis OTP store)
 * means changing one line here. This is the Dependency Inversion Principle made
 * explicit, without a heavyweight DI framework.
 */
export interface Container {
  authGuard: RequestHandler;
  controllers: {
    catalog: CatalogController;
    auth: AuthController;
    users: UserController;
    orders: OrderController;
    pricing: PricingController;
    partners: PartnerController;
    weddings: WeddingController;
  };
}

export function createContainer(): Container {
  // Repositories (data layer)
  const destinationsRepo = new MongoReadRepository<any>(DestinationModel);
  const vehiclesRepo = new MongoReadRepository<any>(VehicleModel);
  const roomsRepo = new MongoReadRepository<any>(RoomModel);
  const optionsRepo = new MongoReadRepository<any>(OptionModel);
  const celebrationsRepo = new MongoReadRepository<any>(CelebrationModel);
  const packagesRepo = new MongoReadRepository<any>(PackageModel);
  const activitiesRepo = new MongoReadRepository<any>(ActivityModel);
  const productsRepo = new MongoReadRepository<any>(ProductModel);
  const shopCatalogsRepo = new MongoReadRepository<any>(ShopCatalogModel);
  const hotelsRepo = new HotelRepository();
  const usersRepo = new UserRepository();
  const ordersRepo = new OrderRepository();
  const partnersRepo = new PartnerRepository();
  const weddingsRepo = new WeddingRepository();

  // Cross-cutting auth primitives
  const tokenService = new JwtTokenService();
  const otpStore = new InMemoryOtpStore();
  const passwordHasher = new BcryptPasswordHasher();

  // Services (use cases)
  const catalogService = new CatalogService({
    destinations: destinationsRepo,
    vehicles: vehiclesRepo,
    rooms: roomsRepo,
    hotels: hotelsRepo,
    options: optionsRepo,
    celebrations: celebrationsRepo,
    packages: packagesRepo,
    activities: activitiesRepo,
    products: productsRepo,
    shopCatalogs: shopCatalogsRepo,
  });
  const userService = new UserService(usersRepo);
  const orderService = new OrderService(ordersRepo);
  const authService = new AuthService(otpStore, tokenService, passwordHasher, usersRepo);
  const pricingService = new PricingService(vehiclesRepo, destinationsRepo);
  const partnerService = new PartnerService(partnersRepo);
  const weddingService = new WeddingService(weddingsRepo);

  return {
    authGuard: buildAuthGuard(tokenService),
    controllers: {
      catalog: new CatalogController(catalogService),
      auth: new AuthController(authService),
      users: new UserController(userService),
      orders: new OrderController(orderService),
      pricing: new PricingController(pricingService),
      partners: new PartnerController(partnerService),
      weddings: new WeddingController(weddingService),
    },
  };
}
