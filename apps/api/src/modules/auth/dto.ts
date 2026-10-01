import { Transform } from "class-transformer";
import { IsString, Length, Matches } from "class-validator";
import { USERNAME_MAX, USERNAME_MIN, USERNAME_REGEX, normalizarUsername } from "@streamz/shared";

// Normaliza antes de validar: o que é gravado e comparado é sempre a forma canônica.
const normalizar = ({ value }: { value: unknown }) =>
  typeof value === "string" ? normalizarUsername(value) : value;

export class RegisterDto {
  @Transform(normalizar)
  @IsString()
  @Length(USERNAME_MIN, USERNAME_MAX)
  @Matches(USERNAME_REGEX, {
    message: "username: use apenas letras minúsculas, números, _ e . (sem dois pontos seguidos)",
  })
  username!: string;

  @IsString()
  @Length(6, 128)
  password!: string;
}

export class LoginDto {
  @Transform(normalizar)
  @IsString()
  @Length(1, 64)
  username!: string;

  @IsString()
  @Length(6, 128)
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}
