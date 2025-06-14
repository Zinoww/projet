'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/src/lib/supabaseClient'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    useEffect(() => {
        const checkSession = async () => {
            const { data } = await supabase.auth.getSession()
            const session = data.session

            if (!session) {
                router.push('/login')
            } else {
                setLoading(false)
            }
        }

        checkSession()
    }, [router])

    if (loading) {
        return <div className="text-center mt-10">Chargement...</div>
    }

    return <>{children}</>
}
