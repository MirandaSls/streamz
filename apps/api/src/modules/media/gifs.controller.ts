import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { GifsService } from "./gifs.service";
import { JwtGuard } from "../../common/jwt.guard";

/**
 * Busca de GIF. Autenticada: a chave do provedor é nossa, e sem o guard
 * qualquer um poderia usar a API como proxy de busca à custa da nossa cota.
 */
@UseGuards(JwtGuard)
@Controller("gifs")
export class GifsController {
  constructor(private readonly gifs: GifsService) {}

  /** Sem `q`, devolve o que está em alta — é o estado inicial do seletor. */
  @Get("search")
  search(@Query("q") q?: string, @Query("limit") limit?: string) {
    return this.gifs.search(q ?? "", limit ? Number(limit) : undefined);
  }

  @Get("categories")
  categories() {
    return this.gifs.categories();
  }
}
