import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // Need to create Table component or just use HTML table. 
// I'll use HTML table for simplicity or create Table component.
// Creating a simple Table component inline or in components/ui/table.tsx is better.
// I'll create components/ui/table.tsx first? No, I'll use standard HTML table with tailwind classes for now to be fast.

export default function FeeStructurePage() {
    return (
        <div className="container py-12 px-4 md:px-6">
            <h1 className="text-4xl font-bold tracking-tight mb-8 text-center">Fee Structure (2024-2025)</h1>

            <div className="space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Tuition Fees (Annual)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="relative w-full overflow-auto">
                            <table className="w-full caption-bottom text-sm">
                                <thead className="[&_tr]:border-b">
                                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Grade Level</th>
                                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Term 1</th>
                                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Term 2</th>
                                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="[&_tr:last-child]:border-0">
                                    <tr className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-4 align-middle">Primary (Grades 1-5)</td>
                                        <td className="p-4 align-middle">$1,500</td>
                                        <td className="p-4 align-middle">$1,500</td>
                                        <td className="p-4 align-middle font-bold">$3,000</td>
                                    </tr>
                                    <tr className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-4 align-middle">Middle School (Grades 6-8)</td>
                                        <td className="p-4 align-middle">$2,000</td>
                                        <td className="p-4 align-middle">$2,000</td>
                                        <td className="p-4 align-middle font-bold">$4,000</td>
                                    </tr>
                                    <tr className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-4 align-middle">High School (Grades 9-12)</td>
                                        <td className="p-4 align-middle">$2,500</td>
                                        <td className="p-4 align-middle">$2,500</td>
                                        <td className="p-4 align-middle font-bold">$5,000</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader><CardTitle>One-time Fees</CardTitle></CardHeader>
                        <CardContent>
                            <ul className="space-y-2">
                                <li className="flex justify-between"><span>Admission Fee</span> <span className="font-semibold">$500</span></li>
                                <li className="flex justify-between"><span>Security Deposit (Refundable)</span> <span className="font-semibold">$200</span></li>
                                <li className="flex justify-between"><span>Tech Fee</span> <span className="font-semibold">$100</span></li>
                            </ul>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle>Transport & Meals</CardTitle></CardHeader>
                        <CardContent>
                            <ul className="space-y-2">
                                <li className="flex justify-between"><span>Bus Service (Monthly)</span> <span className="font-semibold">$150</span></li>
                                <li className="flex justify-between"><span>Meal Plan (Monthly)</span> <span className="font-semibold">$100</span></li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
