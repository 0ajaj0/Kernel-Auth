// KernelAuth C++ example
#include "../include/KernelAuth.h"
#include <iostream>

int main() {
    // Replace with credentials from Dashboard → Applications → Credentials
    KernelAuth::KernelAuthClient auth(
        "YOUR_OWNER_ID",
        "YOUR_APP_NAME",
        "1.0",
        "YOUR_APP_SECRET",
        "https://kernelauth.netlify.app/api"
    );

    if (!auth.Init()) {
        std::cout << "Init failed: " << auth.GetResponse().message << std::endl;
        return 1;
    }

    // License key login
    if (!auth.LicenseLogin("KERNEL-XXXX-XXXX")) {
        std::cout << "Login failed: " << auth.GetResponse().message << std::endl;
        return 1;
    }

    std::cout << "Licensed! Subscription: " << auth.GetUser().subscription << std::endl;
    return 0;
}
