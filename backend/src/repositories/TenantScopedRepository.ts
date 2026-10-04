import { Types, type FilterQuery, type Model, type UpdateQuery } from 'mongoose';
import { AppError } from '../utils/AppError';

export interface TenantScopedOptions {
  /**
   * The tenant the caller is allowed to act on. Derived server-side from the
   * verified JWT or from a database-verified support session.
   */
  agencyId: string;
  /** Optional client company constraint (used to scope client accounts). */
  clientId?: string | null;
}

function assertObjectId(value: string, field: string): void {
  if (!Types.ObjectId.isValid(value)) {
    throw AppError.notFound(`Invalid ${field}`);
  }
}

/**
 * Base class for every tenant-owned collection.
 *
 * The important guarantee: `agencyId` is supplied **once, by the caller that
 * already knows the authenticated tenant**, and is then merged into every
 * query this repository builds. Application code never composes a filter by
 * hand, so a forgotten `agencyId` is not possible.
 */
export abstract class TenantScopedRepository<T> {
  protected abstract readonly model: Model<T>;

  constructor(protected readonly scope: TenantScopedOptions) {
    if (!scope.agencyId) {
      throw AppError.internal('Tenant scope is required: refusing to build an unscoped query');
    }
    assertObjectId(scope.agencyId, 'agency identifier');
    if (scope.clientId) assertObjectId(scope.clientId, 'client identifier');
  }

  get agencyId(): string {
    return this.scope.agencyId;
  }

  get clientId(): string | null {
    return this.scope.clientId ?? null;
  }

  /** Tenant filter that must be present on every read. */
  protected tenantFilter(): FilterQuery<T> {
    return { agencyId: new Types.ObjectId(this.scope.agencyId) } as FilterQuery<T>;
  }

  /**
   * Tenant + client filter for client-facing reads. A client account may only
   * ever see documents belonging to its own company record.
   */
  protected clientFilter(): FilterQuery<T> {
    if (!this.scope.clientId) {
      // No client scope => the caller is agency staff, so only tenant scope applies.
      return this.tenantFilter();
    }
    return {
      ...this.tenantFilter(),
      clientId: new Types.ObjectId(this.scope.clientId),
    } as FilterQuery<T>;
  }

  /** Merge tenant scoping into any caller-supplied filter. */
  protected scoped(filter: FilterQuery<T> = {}, useClientScope = false): FilterQuery<T> {
    const base = useClientScope ? this.clientFilter() : this.tenantFilter();
    return { ...filter, ...base } as FilterQuery<T>;
  }

  async findById(id: string, options: { clientScope?: boolean } = {}): Promise<T | null> {
    assertObjectId(id, 'identifier');
    return this.model.findOne(this.scoped({ _id: new Types.ObjectId(id) }, options.clientScope)).lean<T>().exec();
  }

  /** Returns 404 rather than leaking the existence of another tenant's document. */
  async findByIdOrFail(id: string, label = 'Resource', options: { clientScope?: boolean } = {}): Promise<T> {
    const doc = await this.findById(id, options);
    if (!doc) throw AppError.notFound(`${label} not found`);
    return doc;
  }

  async exists(filter: FilterQuery<T> = {}): Promise<boolean> {
    const doc = await this.model.findOne(this.scoped(filter)).select('_id').lean().exec();
    return Boolean(doc);
  }

  async updateById(
    id: string,
    update: UpdateQuery<T>,
    options: { clientScope?: boolean } = {},
  ): Promise<T | null> {
    assertObjectId(id, 'identifier');
    // The tenant filter stays in the update predicate, so a cross-tenant write
    // simply matches nothing.
    return this.model
      .findOneAndUpdate(this.scoped({ _id: new Types.ObjectId(id) }, options.clientScope), update, {
        new: true,
        runValidators: true,
      })
      .lean<T>()
      .exec();
  }

  async deleteById(id: string): Promise<boolean> {
    assertObjectId(id, 'identifier');
    const result = await this.model.deleteOne(this.scoped({ _id: new Types.ObjectId(id) })).exec();
    return result.deletedCount === 1;
  }

  async count(filter: FilterQuery<T> = {}, options: { clientScope?: boolean } = {}): Promise<number> {
    return this.model.countDocuments(this.scoped(filter, options.clientScope)).exec();
  }
}

/**
 * Repository for the global (non-tenant) Agency collection.
 *
 * Agency documents are intentionally untyped here: they are platform-level
 * records, and this repository is only used by the super admin service which
 * works with a small, explicitly shaped subset of fields.
 */
export class AgencyRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly model: Model<any>) {}

  findById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Agency not found');
    return this.model.findById(new Types.ObjectId(id)).lean().exec();
  }

  findByEmail(email: string) {
    return this.model.findOne({ email: email.toLowerCase() }).lean().exec();
  }

  findAll(filter: Record<string, unknown> = {}) {
    return this.model.find(filter).lean().exec();
  }

  updateById(id: string, update: Record<string, unknown>) {
    if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Agency not found');
    return this.model
      .findByIdAndUpdate(new Types.ObjectId(id), update, { new: true, runValidators: true })
      .lean()
      .exec();
  }

  create(doc: Record<string, unknown>) {
    return this.model.create(doc);
  }
}