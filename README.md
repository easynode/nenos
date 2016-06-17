## What is NOS?

[NOS(Netease Object Storage)](https://c.163.com) is a cloud storage platform based on a distributed file system. Users can easily upload and download files of various sizes through a simple RESTful API on various platforms, and can easily view resource usage statistics.
Now it is only for internal users, in the future will be open to external users.

## How to USE NOS?

* Step 1: Apply a barrel

Go to the [NOS service platform](https://c.163.com) to apply a barrel. In there you will get the config. such as

in the public mode:
```
 "nos": {
    "urlPath": "",
    "host": "",
    "accessKey": "",
    "secretKey": "",
    "bucket": "",
    "public": true
  }
```
in the private mode:
```
  "nos": {
    "urlPath": "",
    "host": "",
    "accessKey": "",
    "secretKey": "",
    "public": false,
    "expires":4619733671,
    "bucket": ""
  }
```

* Step 2: Look up the Examples

download the code from the repository named [`easynode-template`](http://easynode.github.io/demo-nos/) and check out the branch named `nos`.

```
 git clone https://github.com/easynode/easynode-template.git
 git checkout origin/nos

```
