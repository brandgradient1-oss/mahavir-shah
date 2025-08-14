#!/usr/bin/env python3
"""
Backend API Testing for DataHarvester MVP
Tests all backend endpoints via the public URL
"""

import requests
import sys
import json
from datetime import datetime

class DataHarvesterAPITester:
    def __init__(self, base_url="https://dataharvester.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED")
        if details:
            print(f"   Details: {details}")
        print()

    def test_root_endpoint(self):
        """Test GET /api/ endpoint"""
        try:
            response = self.session.get(f"{self.api_url}/")
            success = (response.status_code == 200 and 
                      response.json().get("message") == "Hello World")
            details = f"Status: {response.status_code}, Response: {response.json()}"
            self.log_test("Root Endpoint", success, details)
            return success
        except Exception as e:
            self.log_test("Root Endpoint", False, f"Exception: {str(e)}")
            return False

    def test_scrape_valid_url(self):
        """Test POST /api/scrape/url with valid URL"""
        try:
            payload = {"url": "https://stripe.com", "mode": "realtime"}
            response = self.session.post(f"{self.api_url}/scrape/url", json=payload)
            
            success = response.status_code == 200
            if success:
                data = response.json()
                required_fields = ["job_id", "status", "data", "excel_path"]
                has_required = all(field in data for field in required_fields)
                has_data_fields = isinstance(data.get("data"), dict) and len(data["data"]) > 0
                success = has_required and has_data_fields and data["status"] == "DONE"
                
                details = f"Status: {response.status_code}, Job ID: {data.get('job_id', 'N/A')}, Data fields: {len(data.get('data', {}))}"
                self.log_test("Scrape Valid URL", success, details)
                return success, data.get("job_id")
            else:
                details = f"Status: {response.status_code}, Response: {response.text[:200]}"
                self.log_test("Scrape Valid URL", False, details)
                return False, None
                
        except Exception as e:
            self.log_test("Scrape Valid URL", False, f"Exception: {str(e)}")
            return False, None

    def test_download_excel(self, job_id):
        """Test GET /api/download/{job_id} endpoint"""
        if not job_id:
            self.log_test("Download Excel", False, "No job_id provided")
            return False
            
        try:
            response = self.session.get(f"{self.api_url}/download/{job_id}")
            success = (response.status_code == 200 and 
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' in response.headers.get('content-type', ''))
            
            if success:
                content_length = len(response.content)
                details = f"Status: {response.status_code}, Content-Type: {response.headers.get('content-type')}, Size: {content_length} bytes"
            else:
                details = f"Status: {response.status_code}, Content-Type: {response.headers.get('content-type', 'N/A')}"
                
            self.log_test("Download Excel", success, details)
            return success
            
        except Exception as e:
            self.log_test("Download Excel", False, f"Exception: {str(e)}")
            return False

    def test_scrape_invalid_url(self):
        """Test POST /api/scrape/url with invalid URL"""
        try:
            payload = {"url": "notaurl", "mode": "realtime"}
            response = self.session.post(f"{self.api_url}/scrape/url", json=payload)
            
            success = response.status_code == 400
            details = f"Status: {response.status_code}, Response: {response.text[:200]}"
            self.log_test("Scrape Invalid URL", success, details)
            return success
            
        except Exception as e:
            self.log_test("Scrape Invalid URL", False, f"Exception: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all backend API tests"""
        print("🚀 Starting DataHarvester Backend API Tests")
        print(f"Base URL: {self.base_url}")
        print(f"API URL: {self.api_url}")
        print("=" * 60)
        
        # Test 1: Root endpoint
        self.test_root_endpoint()
        
        # Test 2: Valid URL scraping
        scrape_success, job_id = self.test_scrape_valid_url()
        
        # Test 3: Download Excel (only if scrape succeeded)
        if scrape_success and job_id:
            self.test_download_excel(job_id)
        else:
            self.log_test("Download Excel", False, "Skipped due to failed scrape")
        
        # Test 4: Invalid URL scraping
        self.test_scrape_invalid_url()
        
        # Print summary
        print("=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print("⚠️  Some tests failed. Check logs above.")
            return 1

def main():
    tester = DataHarvesterAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())