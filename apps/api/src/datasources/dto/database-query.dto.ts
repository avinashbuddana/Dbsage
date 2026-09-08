import { IsString, Length } from 'class-validator';

export class DatabaseQueryDto {
  @IsString()
  @Length(1, 1_000)
  question!: string;
}
