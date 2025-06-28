'use client'

import { useState } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const router = useRouter()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        })

        if (error) {
            setError('Identifiants invalides.')
        } else {
            router.push('/cours') // ou dashboard
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-100 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
            <div className="max-w-md w-full">
                <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl border border-indigo-100">
                    <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Connexion</h1>

                    {error && <p className="text-red-500 mb-4 bg-red-50 p-3 rounded-lg border border-red-200">{error}</p>}

                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        required
                        onChange={e => setEmail(e.target.value)}
                        className="w-full mb-4 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <input
                        type="password"
                        placeholder="Mot de passe"
                        value={password}
                        required
                        onChange={e => setPassword(e.target.value)}
                        className="w-full mb-4 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <button
                        type="submit"
                        className="bg-indigo-600 text-white w-full py-3 rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
                    >
                        Se connecter
                    </button>
                </form>
            </div>
        </div>
    )
}
