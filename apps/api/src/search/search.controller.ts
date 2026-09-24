import { Controller, Get, Inject, Query } from '@nestjs/common';
import { SearchQuery, type SearchResults } from '@nook/contracts';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SearchService } from './search.service.js';

@Controller()
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  /** Search-as-you-type sends a request per pause in typing; the limit only stops runaway clients. */
  @Get('search')
  async search(@CurrentUser() me: AuthUser, @Query(new ZodValidationPipe(SearchQuery)) query: SearchQuery): Promise<SearchResults> {
    await this.limiter.hit(`search:${me.id}`, 60, 10);
    return this.searchService.search(me.id, query);
  }
}
