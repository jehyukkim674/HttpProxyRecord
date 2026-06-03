import type { TrafficFilter, TrafficRecord } from './types';

export const emptyFilter = (): TrafficFilter => ({
  domain: '',
  methods: [],
  statusClasses: [],
  search: '',
  searchBody: false,
});

/** 트래픽 목록을 필터 조건(AND 결합)으로 거른다. 순수함수. */
export const filterTraffic = (records: TrafficRecord[], filter: TrafficFilter): TrafficRecord[] => {
  const domain = filter.domain.trim().toLowerCase();
  const search = filter.search.trim().toLowerCase();

  return records.filter((record) => {
    if (domain && !record.host.toLowerCase().includes(domain)) return false;
    if (filter.methods.length > 0 && !filter.methods.includes(record.method)) return false;
    if (
      filter.statusClasses.length > 0 &&
      !filter.statusClasses.includes(Math.floor(record.statusCode / 100))
    ) {
      return false;
    }
    if (search) {
      const inUrl = record.url.toLowerCase().includes(search) || record.path.toLowerCase().includes(search);
      const inBody =
        filter.searchBody === true &&
        ((record.requestBody?.toLowerCase().includes(search) ?? false) ||
          (record.responseBody?.toLowerCase().includes(search) ?? false));
      if (!inUrl && !inBody) return false;
    }
    return true;
  });
};
