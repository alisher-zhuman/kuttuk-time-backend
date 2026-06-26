import { Injectable, Logger, NotFoundException, ConflictException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Category } from "./entities/category.entity";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.categoryRepo.find({ order: { order: "ASC", name: "ASC" } });
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const existing = await this.categoryRepo.findOne({ where: { name: dto.name } });

    if (existing) {
      throw new ConflictException(`Category "${dto.name}" already exists`);
    }

    const category = this.categoryRepo.create(dto);
    const saved = await this.categoryRepo.save(category);
    this.logger.log(`Category created: id=${saved.id} name="${saved.name}"`);
    return saved;
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findEntity(id);
    Object.assign(category, dto);
    const saved = await this.categoryRepo.save(category);
    this.logger.log(`Category updated: id=${id}`);
    return saved;
  }

  async remove(id: number): Promise<void> {
    const category = await this.findEntity(id);
    await this.categoryRepo.remove(category);
    this.logger.log(`Category deleted: id=${id}`);
  }

  private async findEntity(id: number): Promise<Category> {
    const category = await this.categoryRepo.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException("Category not found");
    }

    return category;
  }
}
