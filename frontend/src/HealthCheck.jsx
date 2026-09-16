import { useEffect, useState } from 'react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export default function HealthCheck() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data) => setStatus(data.status === 'ok' ? 'connected' : 'error'))
      .catch(() => setStatus('error'))
  }, [])

  return <p>Backend status: {status}</p>
}
