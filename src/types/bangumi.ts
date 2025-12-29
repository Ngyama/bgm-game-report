export interface BangumiImage {
  large: string;
  common: string;
  medium: string;
  small: string;
  grid: string;
}

export interface BangumiSubject {
  id: number;
  name: string;
  name_cn: string;
  short_summary: string;
  images: BangumiImage;
  score: number;
  type: number;
  date: string;
}

export interface BangumiCollectionItem {
  subject_id: number;
  subject_type: number;
  rate: number;
  type: number;
  comment: string;
  tags: string[];
  ep_status: number;
  vol_status: number;
  updated_at: string;
  private: boolean;
  subject: BangumiSubject;
}

export interface BangumiCollectionResponse {
  total: number;
  limit: number;
  offset: number;
  data: BangumiCollectionItem[];
}

