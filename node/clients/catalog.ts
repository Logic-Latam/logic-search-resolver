import {
  AppClient,
  InstanceOptions,
  IOContext,
  RequestConfig,
  SegmentData,
} from '@vtex/api'
import { stringify } from 'qs'

import { searchEncodeURI, CatalogCrossSellingTypes } from '../resolvers/catalog/utils'

interface AutocompleteArgs {
  maxRows: number | string
  searchTerm: string
}

const inflightKey = ({ baseURL, url, params, headers }: RequestConfig) => {
  return (
    baseURL! +
    url! +
    stringify(params, { arrayFormat: 'repeat', addQueryPrefix: true }) +
    `&segmentToken=${headers['x-vtex-segment']}`
  )
}

interface CatalogPageTypeResponse {
  id: string
  pageType: string
  name: string
  url: string
  title: string | null
  metaTagDescription: string | null
}

/** Catalog API
 * Docs: https://documenter.getpostman.com/view/845/catalogsystem-102/Hs44
 */
export class Catalog extends AppClient {
  public constructor(ctx: IOContext, opts?: InstanceOptions) {
    super('vtex.catalog-api-proxy', ctx, opts)
  }

  public pageType = (path: string, query: string = '') => {
    const pageTypePath = path.startsWith('/') ? path.substr(1) : path

    const pageTypeQuery = !query || query.startsWith('?') ? query : `?${query}`

    return this.get<CatalogPageTypeResponse>(
      `/pub/portal/pagetype/${pageTypePath}${pageTypeQuery}`,
      { metric: 'catalog-pagetype' }
    )
  }

  public product = (slug: string) =>
    this.get<CatalogProduct[]>(
      `/pub/products/search/${searchEncodeURI(slug && slug.toLowerCase())}/p`,
      { metric: 'catalog-product' }
    )

  public productByEan = (id: string) =>
    this.get<CatalogProduct[]>(
      `/pub/products/search?fq=alternateIds_Ean:${id}`,
      {
        metric: 'catalog-productByEan',
      }
    )

  public productsByEan = (ids: string[]) =>
    this.get<CatalogProduct[]>(
      `/pub/products/search?${ids
        .map(id => `fq=alternateIds_Ean:${id}`)
        .join('&')}`,
      { metric: 'catalog-productByEan' }
    )

  public productById = (id: string) => {
    const isVtex = this.context.platform === 'vtex'
    const url = isVtex ? '/pub/products/search?fq=productId:' : '/products/'
    return this.get<CatalogProduct[]>(`${url}${id}`, {
      metric: 'catalog-productById',
    })
  }

  public productsById = (ids: string[]) =>
    this.get<CatalogProduct[]>(
      `/pub/products/search?${ids.map(id => `fq=productId:${id}`).join('&')}`,
      { metric: 'catalog-productById' }
    )

  public productByReference = (id: string) =>
    this.get<CatalogProduct[]>(
      `/pub/products/search?fq=alternateIds_RefId:${id}`,
      {
        metric: 'catalog-productByReference',
      }
    )

  public productsByReference = (ids: string[]) =>
    this.get<CatalogProduct[]>(
      `/pub/products/search?${ids
        .map(id => `fq=alternateIds_RefId:${id}`)
        .join('&')}`,
      { metric: 'catalog-productByReference' }
    )

  public productBySku = (skuIds: string[]) =>
    this.get<CatalogProduct[]>(
      `/pub/products/search?${skuIds
        .map(skuId => `fq=skuId:${skuId}`)
        .join('&')}`,
      { metric: 'catalog-productBySku' }
    )

  public products = (args: SearchArgs, useRaw = false) => {
    const method = useRaw ? this.getRaw : this.get
    return method<CatalogProduct[]>(this.productSearchUrl(args), {
      metric: 'catalog-products',
    })
  }

  public productsQuantity = async (args: SearchArgs) => {
    const {
      headers: { resources },
    } = await this.getRaw(this.productSearchUrl(args))
    const quantity = resources.split('/')[1]
    return parseInt(quantity, 10)
  }

  public brands = () =>
    this.get<Brand[]>('/pub/brand/list', { metric: 'catalog-brands' })

  public brand = (id: number) =>
    this.get<Brand[]>(`/pub/brand/${id}`, { metric: 'catalog-brands' })

  public categories = (treeLevel: number) =>
    this.get<CategoryTreeResponse[]>(`/pub/category/tree/${treeLevel}/`, {
      metric: 'catalog-categories',
    })

  public facets = (facets: string = '') => {
    const [path, options] = decodeURI(facets).split('?')
    return this.get<CatalogFacets>(
      `/pub/facets/search/${searchEncodeURI(encodeURI(
        `${path.trim()}${options ? '?' + options : ''}`
      ))}`,
      { metric: 'catalog-facets' }
    )
  }

  public category = (id: string | number) =>
    this.get<CategoryByIdResponse>(`/pub/category/${id}`, {
      metric: 'catalog-category',
    })

  public crossSelling = (id: string, type: CatalogCrossSellingTypes) =>
    this.get<CatalogProduct[]>(`/pub/products/crossselling/${type}/${id}`, {
      metric: 'catalog-crossSelling',
    })

  public autocomplete = ({ maxRows, searchTerm }: AutocompleteArgs) =>
    this.get<{ itemsReturned: CatalogAutocompleteUnit[] }>(
      `/buscaautocomplete?maxRows=${maxRows}&productNameContains=${searchEncodeURI(
        encodeURIComponent(searchTerm)
      )}`,
      { metric: 'catalog-autocomplete' }
    )

  private get = <T = any>(url: string, config: RequestConfig = {}) => {
    const segmentData: SegmentData | undefined = (this
      .context! as CustomIOContext).segment
    const { channel: salesChannel = '' } = segmentData || {}

    config.params = {
      ...config.params,
      ...(!!salesChannel && { sc: salesChannel }),
    }

    config.inflightKey = inflightKey

    return this.http.get<T>(`/proxy/catalog${url}`, config)
  }

  private getRaw = <T = any>(url: string, config: RequestConfig = {}) => {
    const segmentData: SegmentData | undefined = (this
      .context! as CustomIOContext).segment
    const { channel: salesChannel = '' } = segmentData || {}

    config.params = {
      ...config.params,
      ...(!!salesChannel && { sc: salesChannel }),
    }

    config.inflightKey = inflightKey
    return this.http.getRaw<T>(`/proxy/catalog${url}`, config)
  }

  private productSearchUrl = ({
    query = '',
    category = '',
    specificationFilters,
    priceRange = '',
    collection = '',
    salesChannel = '',
    orderBy = '',
    from = 0,
    to = 9,
    map = '',
    hideUnavailableItems = false,
  }: SearchArgs) => {
    const sanitizedQuery = searchEncodeURI(
      encodeURIComponent(
        decodeURIComponent(query || '').trim()
      )
    )
    if (hideUnavailableItems) {
      const segmentData = (this.context as CustomIOContext).segment
      salesChannel = (segmentData && segmentData.channel.toString()) || ''
    }
    let url = `/pub/products/search/${sanitizedQuery}?`
    if (category && !query) {
      url += `&fq=C:/${category}/`
    }
    if (specificationFilters && specificationFilters.length > 0) {
      url += specificationFilters.map(filter => `&fq=${filter}`)
    }
    if (priceRange) {
      url += `&fq=P:[${priceRange}]`
    }
    if (collection) {
      url += `&fq=productClusterIds:${collection}`
    }
    if (salesChannel) {
      url += `&fq=isAvailablePerSalesChannel_${salesChannel}:1`
    }
    if (orderBy) {
      url += `&O=${orderBy}`
    }
    if (map) {
      url += `&map=${map}`
    }
    if (from != null && from > -1) {
      url += `&_from=${from}`
    }
    if (to != null && to > -1) {
      url += `&_to=${to}`
    }
    return url
  }
}
