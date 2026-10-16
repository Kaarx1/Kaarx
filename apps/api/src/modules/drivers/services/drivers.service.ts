import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  daysBetween,
  REQUIRED_DRIVER_DOCUMENTS,
  todayIsoDateIST,
  type AdminDriversQuery,
  type CreateDriverInput,
  type DriverDocumentInput,
  type DriverOnboardingInput,
  type DriverSelfView,
  type SuspendDriverInput,
  type VehicleSnapshot,
} from '@kaarx/shared';
import { AuditService } from '../../../common/audit/audit.service';
import { isUniqueViolation } from '../../../common/db-errors';
import type { Driver, DriverDocument } from '../../../database/entities';
import {
  BookingRepository,
  DriverDocumentRepository,
  DriverRepository,
} from '../../../database/repositories';
import { canDrive, toDriverSelfView } from '../driver.views';

export const DRIVER_NOT_APPROVED = 'Your account is not approved yet. Kaarx will contact you.';
export const DRIVER_SUSPENDED = 'Your account is suspended. Contact Kaarx support.';
const DRIVER_NOT_FOUND = 'Driver not found';
const PVC_MIN_AGE_DAYS = 7;

export function approvalGaps(
  driver: Driver,
  documents: DriverDocument[],
  todayIso: string,
): string[] {
  const valid = documents.filter(
    (d) => d.status === 'approved' && (d.expiryDate === null || d.expiryDate >= todayIso),
  );
  const missing: string[] = REQUIRED_DRIVER_DOCUMENTS.filter(
    (type) => !valid.some((d) => d.type === type),
  );
  const policeVerifications = valid.filter((d) => d.type === 'police_verification');
  const policeVerificationAged = policeVerifications.some(
    (d) => d.issueDate !== null && daysBetween(d.issueDate, todayIso) >= PVC_MIN_AGE_DAYS,
  );
  if (policeVerifications.length > 0 && !policeVerificationAged)
    missing.push('police_verification_7_days');
  if (driver.trainingCompletedAt === null) missing.push('induction_training');
  if (driver.agreementSignedAt === null) missing.push('driver_agreement');
  if (driver.codeOfConductSignedAt === null) missing.push('code_of_conduct');
  return missing;
}

@Injectable()
export class DriversService {
  constructor(
    private readonly driverRepo: DriverRepository,
    private readonly documentRepo: DriverDocumentRepository,
    private readonly bookingRepo: BookingRepository,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async create(input: CreateDriverInput, adminId: string): Promise<Driver> {
    const id = randomUUID();
    try {
      await this.dataSource.transaction(async (m) => {
        await this.driverRepo.insert(
          {
            id,
            phone: input.phone,
            fullName: input.fullName,
            dob: input.dob,
            gender: input.gender,
            email: input.email ?? null,
            photoUrl: input.photoUrl ?? null,
            preferredLanguage: input.preferredLanguage,
            languages: input.languages,
            currentAddress: input.currentAddress,
            permanentAddress: input.permanentAddress ?? null,
            emergencyContactName: input.emergencyContactName,
            emergencyContactRelation: input.emergencyContactRelation ?? null,
            emergencyContactPhone: input.emergencyContactPhone,
            experienceYears: input.experienceYears,
            transmission: input.transmission,
            bodyTypes: input.bodyTypes,
            evExperience: input.evExperience,
            previousPlatform: input.previousPlatform ?? null,
          },
          m,
        );
        await this.audit.record(
          {
            adminId,
            action: 'driver.created',
            entityType: 'driver',
            entityId: id,
            after: { phone: input.phone, fullName: input.fullName },
          },
          m,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error, 'drivers_phone_key')) {
        throw new ConflictException('A driver with this phone number already exists');
      }
      throw error;
    }
    return this.getById(id);
  }

  list(query: AdminDriversQuery): Promise<Driver[]> {
    return this.driverRepo.findRecent(query.status);
  }

  async getDetail(id: string): Promise<{ driver: Driver; documents: DriverDocument[] }> {
    const driver = await this.getById(id);
    const documents = await this.documentRepo.findByDriver(id);
    return { driver, documents };
  }

  async addDocument(
    driverId: string,
    input: DriverDocumentInput,
    adminId: string,
  ): Promise<DriverDocument> {
    await this.getById(driverId);
    const id = randomUUID();
    const reviewed = input.status !== 'pending';
    await this.dataSource.transaction(async (m) => {
      await this.documentRepo.insert(
        {
          id,
          driverId,
          type: input.type,
          numberMasked: input.numberMasked ?? null,
          issueDate: input.issueDate ?? null,
          expiryDate: input.expiryDate ?? null,
          fileUrls: input.fileUrls,
          status: input.status,
          rejectionReason: input.rejectionReason ?? null,
          reviewedBy: reviewed ? adminId : null,
          reviewedAt: reviewed ? new Date() : null,
        },
        m,
      );
      await this.audit.record(
        {
          adminId,
          action: 'driver.document_added',
          entityType: 'driver',
          entityId: driverId,
          after: { documentId: id, type: input.type, status: input.status },
        },
        m,
      );
    });
    return this.documentRepo.findByIdOrFail(id);
  }

  async updateOnboarding(
    id: string,
    input: DriverOnboardingInput,
    adminId: string,
  ): Promise<Driver> {
    const before = await this.getById(id);
    const patch: Partial<
      Pick<
        Driver,
        | 'trainingCompletedAt'
        | 'agreementVersion'
        | 'agreementSignedAt'
        | 'codeOfConductSignedAt'
        | 'idCardNumber'
      >
    > = {};
    if (input.trainingCompletedAt !== undefined)
      patch.trainingCompletedAt = input.trainingCompletedAt;
    if (input.agreementVersion !== undefined) patch.agreementVersion = input.agreementVersion;
    if (input.agreementSignedAt !== undefined) patch.agreementSignedAt = input.agreementSignedAt;
    if (input.codeOfConductSignedAt !== undefined)
      patch.codeOfConductSignedAt = input.codeOfConductSignedAt;
    if (input.idCardNumber !== undefined) patch.idCardNumber = input.idCardNumber;
    if (Object.keys(patch).length === 0) return before;
    await this.dataSource.transaction(async (m) => {
      await this.driverRepo.update(id, patch, m);
      await this.audit.record(
        {
          adminId,
          action: 'driver.onboarding_updated',
          entityType: 'driver',
          entityId: id,
          before: {
            trainingCompletedAt: before.trainingCompletedAt,
            agreementVersion: before.agreementVersion,
            agreementSignedAt: before.agreementSignedAt,
            codeOfConductSignedAt: before.codeOfConductSignedAt,
            idCardNumber: before.idCardNumber,
          },
          after: patch,
        },
        m,
      );
    });
    return this.getById(id);
  }

  async approve(id: string, adminId: string): Promise<Driver> {
    const driver = await this.getById(id);
    if (driver.verificationStatus === 'suspended') {
      throw new ConflictException('Reinstate a suspended driver instead of approving them');
    }
    const documents = await this.documentRepo.findByDriver(id);
    const missing = approvalGaps(driver, documents, todayIsoDateIST());
    if (missing.length > 0)
      throw new ConflictException({ message: 'Driver is not ready for approval', missing });
    await this.dataSource.transaction(async (m) => {
      await this.driverRepo.update(
        id,
        {
          verificationStatus: 'approved',
          activatedAt: driver.activatedAt ?? new Date(),
          rejectionReason: null,
        },
        m,
      );
      await this.audit.record(
        {
          adminId,
          action: 'driver.approved',
          entityType: 'driver',
          entityId: id,
          before: { verificationStatus: driver.verificationStatus },
          after: { verificationStatus: 'approved' },
        },
        m,
      );
    });
    return this.getById(id);
  }

  async suspend(id: string, input: SuspendDriverInput, adminId: string): Promise<Driver> {
    const driver = await this.getById(id);
    if (driver.verificationStatus !== 'approved') {
      throw new ConflictException('Only an approved driver can be suspended');
    }
    await this.dataSource.transaction(async (m) => {
      await this.driverRepo.update(
        id,
        {
          verificationStatus: 'suspended',
          suspendedUntil: input.until ?? null,
          suspensionReason: input.reason,
        },
        m,
      );
      await this.audit.record(
        {
          adminId,
          action: 'driver.suspended',
          entityType: 'driver',
          entityId: id,
          before: { verificationStatus: driver.verificationStatus },
          after: {
            verificationStatus: 'suspended',
            reason: input.reason,
            until: input.until ?? null,
          },
        },
        m,
      );
    });
    return this.getById(id);
  }

  async reinstate(id: string, adminId: string): Promise<Driver> {
    const driver = await this.getById(id);
    if (driver.verificationStatus !== 'suspended') {
      throw new ConflictException('Only a suspended driver can be reinstated');
    }
    await this.dataSource.transaction(async (m) => {
      await this.driverRepo.update(
        id,
        {
          verificationStatus: 'approved',
          suspendedUntil: null,
          suspensionReason: null,
        },
        m,
      );
      await this.audit.record(
        {
          adminId,
          action: 'driver.reinstated',
          entityType: 'driver',
          entityId: id,
          before: { verificationStatus: 'suspended', reason: driver.suspensionReason },
          after: { verificationStatus: 'approved' },
        },
        m,
      );
    });
    return this.getById(id);
  }

  async getById(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findById(id);
    if (!driver) throw new NotFoundException(DRIVER_NOT_FOUND);
    return driver;
  }

  getManyByIds(ids: string[]): Promise<Driver[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.driverRepo.findByIds(ids);
  }

  async getSelf(id: string): Promise<DriverSelfView> {
    return toDriverSelfView(await this.getById(id));
  }

  async assertCanDrive(driverId: string): Promise<Driver> {
    const driver = await this.getById(driverId);
    if (canDrive(driver)) return driver;
    const suspended =
      driver.status === 'blocked' ||
      driver.verificationStatus === 'suspended' ||
      (driver.suspendedUntil !== null && driver.suspendedUntil.getTime() > Date.now());
    throw new ForbiddenException(suspended ? DRIVER_SUSPENDED : DRIVER_NOT_APPROVED);
  }

  async findEligibleForOffer(
    candidateIds: string[],
    vehicle: VehicleSnapshot,
    bookingId: string,
  ): Promise<Set<string>> {
    if (candidateIds.length === 0) return new Set();
    return new Set(await this.driverRepo.findEligibleIdsForOffer(candidateIds, vehicle, bookingId));
  }

  async findLiveBooking(
    driverId: string,
  ): Promise<{ bookingId: string; customerId: string } | null> {
    const booking = await this.bookingRepo.findLiveByDriver(driverId);
    return booking ? { bookingId: booking.id, customerId: booking.customerId } : null;
  }

  async incrementTrips(driverId: string, manager: EntityManager): Promise<void> {
    await this.driverRepo.incrementTotalTrips(driverId, manager);
  }
}
