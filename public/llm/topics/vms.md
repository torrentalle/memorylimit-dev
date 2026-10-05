# vms

[Site content map](https://memorylimit.dev/sitemap.md)

- [Systemd Memory Limits Calculator](https://memorylimit.dev/systemd/index.md): Right-size memory for services running directly on a VM or bare-metal Linux host under systemd, without a container runtime. Generates a MemoryHigh / MemoryMax drop-in from real usage data. (en); [canonical page](https://memorylimit.dev/systemd/).
- [VMware vSphere Memory Sizing Calculator](https://memorylimit.dev/vmware/index.md): Right-size a vSphere VM's memory and reservation from real usage data, the way VMware advises: no limit, the configured memory as the cap. Outputs vSphere Client steps and a govc command. (en); [canonical page](https://memorylimit.dev/vmware/).
- [Proxmox VE Memory Calculator](https://memorylimit.dev/proxmox/index.md): Set a Proxmox VE VM's memory and ballooning minimum from real usage data. Outputs the qm command and web UI steps — useful when migrating VMs from VMware. (en); [canonical page](https://memorylimit.dev/proxmox/).
