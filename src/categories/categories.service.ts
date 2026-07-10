import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";

import { Category } from "./entities/category.entity";
import { Merchant } from "@/merchants/entities/merchant.entity";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { ReorderCategoriesDto } from "./dto/reorder-categories.dto";
import { resolveTranslation } from "@/common/utils/resolve-translation";

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAll(lang: string): Promise<{ id: number; name: string; order: number }[]> {
    const categories = await this.categoryRepo.find({ order: { order: "ASC" } });

    return categories.map(({ id, name, order }) => ({
      id,
      name: resolveTranslation(name, lang)!,
      order,
    }));
  }

  async findAllAdmin(): Promise<Category[]> {
    return this.categoryRepo.find({ order: { order: "ASC" } });
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const order = dto.order ?? (await this.nextOrder());
    const category = this.categoryRepo.create({ ...dto, order });
    const saved = await this.categoryRepo.save(category);
    this.logger.log(`Category created: id=${saved.id}`);
    return saved;
  }

  async updateName(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findEntity(id);
    category.name = dto.name;
    const saved = await this.categoryRepo.save(category);
    this.logger.log(`Category renamed: id=${id}`);
    return saved;
  }

  async reorder(dto: ReorderCategoriesDto): Promise<void> {
    const existing = await this.categoryRepo.find({ select: ["id"] });
    const existingIds = new Set(existing.map((c) => c.id));

    if (dto.ids.length !== existingIds.size || !dto.ids.every((id) => existingIds.has(id))) {
      throw new BadRequestException("ids must match the full set of existing category ids");
    }

    await this.dataSource.transaction(async (manager) => {
      await Promise.all(dto.ids.map((id, order) => manager.update(Category, id, { order })));
    });

    this.logger.log(`Categories reordered: ${dto.ids.join(",")}`);
  }

  async remove(id: number): Promise<void> {
    await this.findEntity(id);

    const affected = await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(Merchant)
        .set({ categories: () => "array_remove(categories, :id)" })
        .where(":id = ANY(categories)", { id })
        .execute();

      await manager.delete(Category, id);

      return result.affected ?? 0;
    });

    this.logger.log(`Category deleted: id=${id}, removed from ${affected} merchant(s)`);
  }

  private async nextOrder(): Promise<number> {
    const result = await this.categoryRepo
      .createQueryBuilder("category")
      .select("MAX(category.order)", "max")
      .getRawOne<{ max: number | null }>();

    return (result?.max ?? -1) + 1;
  }

  private async findEntity(id: number): Promise<Category> {
    const category = await this.categoryRepo.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException("Category not found");
    }

    return category;
  }
}
