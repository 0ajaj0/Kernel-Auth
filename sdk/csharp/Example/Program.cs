using System;
using System.Threading.Tasks;
using KernelAuth;

class Program
{
    static async Task Main()
    {
        var auth = new KernelAuthClient(
            "YOUR_OWNER_ID",
            "YOUR_APP_NAME",
            "1.0",
            "YOUR_APP_SECRET",
            "https://kernelauth.netlify.app/api");

        if (!await auth.InitAsync())
        {
            Console.WriteLine("Init failed: " + auth.Response.Message);
            return;
        }

        if (!await auth.LicenseLoginAsync("KERNEL-XXXX-XXXX"))
        {
            Console.WriteLine("Login failed: " + auth.Response.Message);
            return;
        }

        Console.WriteLine("Licensed! " + auth.User.Subscription);
    }
}
