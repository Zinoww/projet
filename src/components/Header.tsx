'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/src/lib/supabaseClient'

export default function Header() {
    const [email, setEmail] = useState<string | null>(null)
    const router = useRouter()

    // Récupérer l'utilisateur connecté
    useEffect(() => {
        const getUser = async () => {
            const { data } = await supabase.auth.getUser()
            setEmail(data.user?.email || null)
        }
        getUser()
    }, [])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <div className="flex justify-between items-center mb-6 p-4 border-b">
            <p className="text-sm text-gray-600">
                {email ? `Connecté en tant que : ${email}` : 'Chargement...'}
            </p>
            <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
                Se déconnecter
            </button>
        </div>
    )
}
