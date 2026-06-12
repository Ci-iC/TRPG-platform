import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// 自动附带 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('trpg_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 401 自动登出
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('trpg_token')
      localStorage.removeItem('trpg_account')
      if (!location.pathname.startsWith('/login')) location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// 统一取后端错误文案
export const errMsg = (e) => e?.response?.data?.error || e?.message || '请求失败'

// 上传图片，返回 url
export async function uploadImage(file) {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await api.post('/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.url
}

export default api
